import { prisma } from "@/lib/prisma";

/**
 * Idempotent invoice-feature usage ledger. Recorded regardless of whether
 * invoice billing is currently active (InvoiceBillingConfiguration.mode)
 * — WGC needs historical usage data to design future pricing without
 * losing anything, but recording a usage event here NEVER itself creates
 * a charge. Nothing in this module calls the payment-routing service or
 * Finix at all.
 */

export type InvoiceUsageEventType =
  | "INVOICE_CREATED"
  | "INVOICE_SENT"
  | "INVOICE_PAID"
  | "INVOICE_PARTIALLY_PAID"
  | "INVOICE_VOIDED"
  | "INVOICE_REFUNDED"
  | "INVOICE_PAYMENT_REVERSED";

export interface RecordInvoiceUsageInput {
  organizationId: string;
  invoiceId: string;
  invoicePaymentId?: string;
  eventType: InvoiceUsageEventType;
  invoiceAmountCents?: number;
  amountPaidCents?: number;
  currency?: string;
  /** A stable, unique-per-real-event key — e.g. `${invoiceId}:SENT:${sendAttemptId}`
   * or `${invoicePaymentId}:PAID`. Callers are responsible for making this
   * genuinely unique per real occurrence so a duplicate webhook, a page
   * refresh, or a retried request can never double-count. */
  idempotencyKey: string;
}

/**
 * Returns the currently-ACTIVE InvoiceBillingConfiguration, or null if
 * invoice billing is DISABLED/DRAFT/none exists — the one place every
 * other invoice-billing code path must check before treating any usage as
 * billable. Safe default: no active configuration means invoice billing is
 * effectively off, regardless of any other state.
 */
export async function getActiveInvoiceBillingConfiguration() {
  return prisma.invoiceBillingConfiguration.findFirst({
    where: { status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }] },
    orderBy: { effectiveFrom: "desc" },
  });
}

/**
 * Determines whether a given event, under the given (possibly null)
 * config, counts as billable — per the config's own trigger/
 * partial-payment/multiple-payment settings. Never assumes a default;
 * with no active config, nothing is ever billable.
 */
function resolveBillable(eventType: InvoiceUsageEventType, config: Awaited<ReturnType<typeof getActiveInvoiceBillingConfiguration>>): boolean {
  if (!config || config.mode === "DISABLED") return false;
  if (config.mode === "INCLUDED_IN_PLATFORM" || config.mode === "MONTHLY_ADD_ON") return false; // usage isn't the billing unit for these modes
  if (config.mode === "PER_INVOICE_SENT") return eventType === "INVOICE_SENT";
  if (config.mode === "PER_INVOICE_PAID" || config.mode === "FLAT_MONTHLY_PLUS_USAGE") {
    if (eventType === "INVOICE_PAID") return true;
    if (eventType === "INVOICE_PARTIALLY_PAID") return config.partialPaymentCountsAsBillable;
    return false;
  }
  return false;
}

export async function recordInvoiceUsageEvent(input: RecordInvoiceUsageInput): Promise<{ recorded: boolean; billable: boolean }> {
  const existing = await prisma.invoiceUsageEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { recorded: false, billable: existing.billable };

  const config = await getActiveInvoiceBillingConfiguration();
  const billable = resolveBillable(input.eventType, config);
  const billingPeriod = new Date().toISOString().slice(0, 7);

  await prisma.invoiceUsageEvent.create({
    data: {
      organizationId: input.organizationId,
      invoiceId: input.invoiceId,
      invoicePaymentId: input.invoicePaymentId ?? null,
      eventType: input.eventType,
      invoiceAmountCents: input.invoiceAmountCents ?? null,
      amountPaidCents: input.amountPaidCents ?? null,
      currency: input.currency ?? "USD",
      idempotencyKey: input.idempotencyKey,
      billingPeriod,
      billable,
      pricingVersionId: config?.id ?? null,
    },
  });

  return { recorded: true, billable };
}
