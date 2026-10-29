import { Prisma, type PartnerInvoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { getConfiguredFinixEnvironment, getWgcBillingMerchantId } from "@/lib/billing/wgcBillingConfig";
import { sendWgcEmail } from "@/lib/email";
import { createAuditLog } from "@/lib/audit";

/**
 * Monthly billing of a software partner: price per merchant x the merchants counted that
 * month, charged to the partner's saved card through WGC's own billing merchant (the same
 * one used for organization subscriptions; never an organization's own merchant).
 *
 * Money rules this file is built around:
 *  - One invoice per partner per month, enforced by a unique key, so the daily job can run
 *    twice (or two servers can run it at once) and still only ever make one.
 *  - An issued invoice is never recomputed: a later price change applies to the next month.
 *  - The Finix call happens outside any database transaction, after the invoice row has been
 *    claimed with a conditional update (CHARGING), so two runs cannot both charge it.
 *  - Each attempt uses its own Finix idempotency id (invoice id + attempt number), so a retry
 *    with a new card is a real new attempt. Before a crashed attempt is repeated, Finix is
 *    asked what became of it, so a charge that did go through is never charged again.
 *  - Charging is OFF unless PARTNER_BILLING_CHARGING_ENABLED=1. Invoices are still made, so
 *    the partner can see what is owed, but no card is touched.
 */

/** Extra attempts granted to an unpaid invoice when the partner saves a new card. */
export const PARTNER_NEW_CARD_EXTRA_ATTEMPTS = 2;
const RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
const STALE_CHARGING_MS = 15 * 60 * 1000;
const RUN_LIMIT = 100;

export type PartnerChargeOutcome = "SUCCEEDED" | "FAILED" | "PENDING" | "AWAITING_CARD" | "SKIPPED";

export function isPartnerChargingEnabled(): boolean {
  return process.env.PARTNER_BILLING_CHARGING_ENABLED === "1";
}

/** "YYYY-MM", UTC. */
export function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** First instant of the month, UTC. */
export function periodStart(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export interface CountedMerchant {
  churchId: string;
  name: string;
  reference: string | null;
}

/**
 * The merchants that count toward a month: approved before that month began, still the
 * partner's, still active, and not waived. A merchant approved mid-month starts counting
 * the next month.
 */
export async function countedMerchants(partnerId: string, period: string): Promise<CountedMerchant[]> {
  const approvals = await prisma.partnerBillableApproval.findMany({
    where: { partnerId, status: "PENDING", approvedAt: { lt: periodStart(period) } },
    select: { churchId: true },
  });
  if (approvals.length === 0) return [];

  const churches = await prisma.church.findMany({
    where: { id: { in: approvals.map((a) => a.churchId) }, partnerId, status: "ACTIVE" },
    select: { id: true, name: true, partnerReference: true },
    orderBy: { name: "asc" },
  });
  return churches.map((c) => ({ churchId: c.id, name: c.name, reference: c.partnerReference }));
}

/**
 * Makes the month's invoice if it does not exist yet. Returns the existing one untouched
 * if it does. Null when there is nothing to bill: no price set, partner not active, or no
 * merchants counted.
 */
export async function ensureInvoiceForPeriod(partnerId: string, period: string): Promise<PartnerInvoice | null> {
  const existing = await prisma.partnerInvoice.findUnique({ where: { partnerId_period: { partnerId, period } } });
  if (existing) return existing;

  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { status: true, pricePerMerchantCents: true } });
  if (!partner || partner.status !== "ACTIVE" || !partner.pricePerMerchantCents || partner.pricePerMerchantCents <= 0) return null;

  const merchants = await countedMerchants(partnerId, period);
  if (merchants.length === 0) return null;

  try {
    return await prisma.partnerInvoice.create({
      data: {
        partnerId,
        period,
        merchantCount: merchants.length,
        unitPriceCents: partner.pricePerMerchantCents,
        amountCents: partner.pricePerMerchantCents * merchants.length,
        lineItemsJson: merchants as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Another run made it first: that one wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.partnerInvoice.findUnique({ where: { partnerId_period: { partnerId, period } } });
    }
    throw err;
  }
}

const attemptKey = (invoiceId: string, attempt: number) => `partner-invoice:${invoiceId}:${attempt}`;

/** What the partner can do about a failed charge. */
function failureAdvice(final: boolean): string {
  return final
    ? "We could not charge your card after several tries. Please add a new card in the Billing page of your partner dashboard."
    : "We could not charge your card. We'll try again tomorrow. You can add a new card in the Billing page of your partner dashboard.";
}

async function notifyPartnerOfFailure(partnerId: string, invoice: { period: string; amountCents: number }, reason: string, final: boolean): Promise<void> {
  try {
    const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { name: true, contactEmail: true, billingContactEmail: true } });
    const to = partner?.billingContactEmail || partner?.contactEmail;
    if (!partner || !to) return;
    await sendWgcEmail({
      to,
      subject: `WGC Payments: your ${invoice.period} charge didn't go through`,
      title: "Your payment didn't go through",
      badgeText: final ? "Action required" : "Payment failed",
      badgeColor: "#F59E0B",
      bodyHtml: `<p>The ${invoice.period} charge of $${(invoice.amountCents / 100).toFixed(2)} for ${partner.name} failed: ${reason}.</p><p>${failureAdvice(final)}</p>`,
    });
  } catch (err) {
    console.error("notifyPartnerOfFailure failed:", err);
  }
}

async function recordFailure(invoice: PartnerInvoice, attempt: number, reason: string, now: Date): Promise<void> {
  const final = attempt >= invoice.attemptBudget;
  await prisma.partnerInvoice.update({
    where: { id: invoice.id },
    data: { status: "FAILED", failureReason: reason.slice(0, 500), nextAttemptAt: final ? null : new Date(now.getTime() + RETRY_DELAY_MS) },
  });
  await createAuditLog({ action: "PARTNER_INVOICE_CHARGE_FAILED", metadata: { partnerId: invoice.partnerId, invoiceId: invoice.id, attempt, final, reason: reason.slice(0, 200) } });
  await notifyPartnerOfFailure(invoice.partnerId, invoice, reason, final);
}

async function recordSuccess(invoice: PartnerInvoice, transferId: string, now: Date): Promise<void> {
  await prisma.partnerInvoice.update({
    where: { id: invoice.id },
    data: { status: "SUCCEEDED", finixTransferId: transferId, chargedAt: now, failureReason: null, nextAttemptAt: null },
  });
  await createAuditLog({ action: "PARTNER_INVOICE_CHARGED", metadata: { partnerId: invoice.partnerId, invoiceId: invoice.id, amountCents: invoice.amountCents, finixTransferId: transferId } });
}

const transferState = (transfer: { state?: string } | null | undefined) => String(transfer?.state ?? "").toUpperCase();

/**
 * Charges one invoice, once. Safe to call repeatedly: it does nothing unless the invoice is
 * actually due (not already paid, not already being charged, retry time reached).
 */
export async function chargePartnerInvoice(invoiceId: string, options: { now?: Date; chargingEnabled?: boolean } = {}): Promise<PartnerChargeOutcome> {
  const now = options.now ?? new Date();
  if (!(options.chargingEnabled ?? isPartnerChargingEnabled())) return "SKIPPED";

  const invoice = await prisma.partnerInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status === "SUCCEEDED" || invoice.status === "WAIVED") return "SKIPPED";

  const partner = await prisma.partner.findUnique({ where: { id: invoice.partnerId }, select: { status: true, billingPaymentInstrumentId: true } });
  if (!partner || partner.status !== "ACTIVE") return "SKIPPED";
  if (!partner.billingPaymentInstrumentId) {
    // Nothing to charge yet. It will be picked up once a card is saved.
    if (invoice.status === "PENDING") await prisma.partnerInvoice.update({ where: { id: invoice.id }, data: { status: "AWAITING_CARD" } });
    return "AWAITING_CARD";
  }

  // Claim it. Only one caller can move it into CHARGING, and only when it is really due.
  const claimed = await prisma.partnerInvoice.updateMany({
    where: {
      id: invoice.id,
      OR: [
        { status: { in: ["PENDING", "AWAITING_CARD"] } },
        // A failure whose budget is spent has no nextAttemptAt, so it never matches here.
        { status: "FAILED", nextAttemptAt: { lte: now } },
        { status: "CHARGING", lastAttemptAt: { lt: new Date(now.getTime() - STALE_CHARGING_MS) } },
      ],
    },
    data: { status: "CHARGING", attemptCount: { increment: 1 }, lastAttemptAt: now },
  });
  if (claimed.count !== 1) return "SKIPPED";

  const attempt = invoice.attemptCount + 1;

  // A CHARGING row that went stale means an earlier attempt was interrupted. Ask Finix what
  // became of it before doing anything else, so a charge that did go through is not repeated.
  if (invoice.status === "CHARGING" && invoice.attemptCount > 0) {
    const interrupted = await finixClient.findTransferByIdempotencyId(attemptKey(invoice.id, invoice.attemptCount)).catch(() => null);
    if (interrupted) {
      const state = transferState(interrupted);
      if (state === "SUCCEEDED") {
        await recordSuccess(invoice, interrupted.id, now);
        return "SUCCEEDED";
      }
      if (state === "PENDING") {
        await prisma.partnerInvoice.update({ where: { id: invoice.id }, data: { finixTransferId: interrupted.id } });
        return "PENDING";
      }
    }
  }

  let transfer: { id: string; state?: string; failure_message?: string | null };
  try {
    transfer = await finixClient.createTransfer({
      merchant: getWgcBillingMerchantId(),
      amount: invoice.amountCents,
      currency: invoice.currency,
      source: partner.billingPaymentInstrumentId,
      idempotency_id: attemptKey(invoice.id, attempt),
      statement_descriptor: "WGC PLATFORM",
      tags: {
        wgc_charge_type: "PARTNER_MONTHLY_BILLING",
        wgc_partner_id: invoice.partnerId,
        wgc_partner_invoice_id: invoice.id,
        wgc_billing_period: invoice.period,
        wgc_environment: getConfiguredFinixEnvironment(),
      },
    });
  } catch (err) {
    await recordFailure(invoice, attempt, err instanceof Error ? err.message : String(err), now);
    return "FAILED";
  }

  const state = transferState(transfer);
  if (state === "SUCCEEDED") {
    await recordSuccess(invoice, transfer.id, now);
    return "SUCCEEDED";
  }
  if (state === "PENDING") {
    // Not settled yet. Keep it CHARGING; the next stale check asks Finix again.
    await prisma.partnerInvoice.update({ where: { id: invoice.id }, data: { finixTransferId: transfer.id } });
    return "PENDING";
  }
  await recordFailure(invoice, attempt, `Card was declined${transfer.failure_message ? ` (${transfer.failure_message})` : ""}`, now);
  return "FAILED";
}

export interface PartnerBillingRunResult {
  period: string;
  invoicesMade: number;
  charged: number;
  failed: number;
  awaitingCard: number;
  pending: number;
  chargingEnabled: boolean;
}

/** The daily job: make this month's invoices, then charge whatever is due. */
export async function runPartnerBilling(options: { now?: Date; chargingEnabled?: boolean } = {}): Promise<PartnerBillingRunResult> {
  const now = options.now ?? new Date();
  const chargingEnabled = options.chargingEnabled ?? isPartnerChargingEnabled();
  const period = periodOf(now);
  const result: PartnerBillingRunResult = { period, invoicesMade: 0, charged: 0, failed: 0, awaitingCard: 0, pending: 0, chargingEnabled };

  const partners = await prisma.partner.findMany({
    where: { status: "ACTIVE", pricePerMerchantCents: { gt: 0 } },
    select: { id: true },
    take: RUN_LIMIT,
  });
  for (const partner of partners) {
    const before = await prisma.partnerInvoice.findUnique({ where: { partnerId_period: { partnerId: partner.id, period } }, select: { id: true } });
    const invoice = await ensureInvoiceForPeriod(partner.id, period);
    if (invoice && !before) result.invoicesMade++;
  }

  const due = await prisma.partnerInvoice.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "AWAITING_CARD"] } },
        { status: "FAILED", nextAttemptAt: { lte: now } },
        { status: "CHARGING", lastAttemptAt: { lt: new Date(now.getTime() - STALE_CHARGING_MS) } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: RUN_LIMIT,
  });
  for (const row of due) {
    const outcome = await chargePartnerInvoice(row.id, { now, chargingEnabled });
    if (outcome === "SUCCEEDED") result.charged++;
    else if (outcome === "FAILED") result.failed++;
    else if (outcome === "AWAITING_CARD") result.awaitingCard++;
    else if (outcome === "PENDING") result.pending++;
  }
  return result;
}
