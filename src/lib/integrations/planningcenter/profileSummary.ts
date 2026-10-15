import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { computeRefundStatus } from "@/lib/finix/refundStatus";
import { frequencyLabel, resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { DAY_PLAN_STATUSES } from "./giftPlan";

/**
 * The "WGC Giving" section for a person in Planning Center, worked out from our own database only (no Planning Center
 * calls), so it also powers the preview a church sees before turning the option on.
 *
 * What counts as a gift here matches what a gift sync sends: the gift amount WITHOUT a donor-covered fee, nothing
 * that gave goods or services in return, and nothing the donor asked to keep anonymous (anonymity is never undone by
 * writing a gift onto a named person). A refund or bank return takes the gift back out. Years are UTC years.
 */

export interface GiftForSummary {
  netCents: number;
  createdAt: Date;
  fundName: string | null;
}

export interface DonorGivingSummary {
  givenThisYearCents: number;
  givenLastYearCents: number;
  lifetimeCents: number;
  giftCount: number;
  firstGiftOn: string | null;
  lastGiftOn: string | null;
  lastGiftCents: number | null;
  /** "No", or e.g. "Yes — $200.00 Monthly". */
  recurring: string;
  mainFund: string | null;
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const dollars = (cents: number) => (cents / 100).toFixed(2);
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Pure: the summary for one donor's gifts (already net of refunds and returns). */
export function summarizeGifts(gifts: GiftForSummary[], recurring: string, now: Date): DonorGivingSummary {
  const counted = gifts.filter((g) => g.netCents > 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const year = now.getUTCFullYear();
  let thisYear = 0;
  let lastYear = 0;
  let lifetime = 0;
  const byFund = new Map<string, number>();
  for (const g of counted) {
    lifetime += g.netCents;
    const y = g.createdAt.getUTCFullYear();
    if (y === year) thisYear += g.netCents;
    else if (y === year - 1) lastYear += g.netCents;
    if (g.fundName) byFund.set(g.fundName, (byFund.get(g.fundName) ?? 0) + g.netCents);
  }
  // Ties go to the fund alphabetically first, so the answer never flips between runs.
  const mainFund = [...byFund.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const first = counted[0];
  const last = counted[counted.length - 1];
  return {
    givenThisYearCents: thisYear,
    givenLastYearCents: lastYear,
    lifetimeCents: lifetime,
    giftCount: counted.length,
    firstGiftOn: first ? dateOnly(first.createdAt) : null,
    lastGiftOn: last ? dateOnly(last.createdAt) : null,
    lastGiftCents: last ? last.netCents : null,
    recurring,
    mainFund,
  };
}

/**
 * The values written to Planning Center, keyed by field. `null` means "nothing to show" and is never written, so an
 * existing value is only ever replaced by a newer one. Money is dollars with cents so it can be filtered as a number.
 */
export function profileFieldValues(summary: DonorGivingSummary, donorUrl: string): Record<string, string | null> {
  return {
    given_this_year: dollars(summary.givenThisYearCents),
    given_last_year: dollars(summary.givenLastYearCents),
    lifetime_total: dollars(summary.lifetimeCents),
    gift_count: String(summary.giftCount),
    first_gift: summary.firstGiftOn,
    last_gift: summary.lastGiftOn,
    last_gift_amount: summary.lastGiftCents === null ? null : dollars(summary.lastGiftCents),
    recurring: summary.recurring,
    main_fund: summary.mainFund,
    wgc_link: donorUrl,
  };
}

export function digestOf(values: Record<string, string | null>): string {
  const ordered = Object.keys(values).sort().map((k) => [k, values[k]]);
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex").slice(0, 32);
}

export function donorPageUrl(donorId: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/merchant/donors/${donorId}`;
}

/** The same fields as they read in Planning Center, for the preview. */
export function describeSummary(summary: DonorGivingSummary): Array<{ label: string; value: string }> {
  return [
    { label: "Given this year", value: money(summary.givenThisYearCents) },
    { label: "Given last year", value: money(summary.givenLastYearCents) },
    { label: "Lifetime total", value: money(summary.lifetimeCents) },
    { label: "Number of gifts", value: String(summary.giftCount) },
    { label: "First gift", value: summary.firstGiftOn ?? "—" },
    { label: "Last gift", value: summary.lastGiftOn ?? "—" },
    { label: "Last gift amount", value: summary.lastGiftCents === null ? "—" : money(summary.lastGiftCents) },
    { label: "Recurring", value: summary.recurring },
    { label: "Main fund", value: summary.mainFund ?? "—" },
  ];
}

/** Summaries for these donors (this church only), in a handful of queries however many donors there are. */
export async function buildDonorSummaries(churchId: string, donorIds: string[], now: Date = new Date()): Promise<Map<string, DonorGivingSummary>> {
  const result = new Map<string, DonorGivingSummary>();
  if (donorIds.length === 0) return result;

  const [payments, subscriptions] = await Promise.all([
    prisma.payment.findMany({
      where: { churchId, donorId: { in: donorIds }, status: { in: DAY_PLAN_STATUSES }, isAnonymous: false, goodsServicesProvided: false },
      select: { donorId: true, amountCents: true, donationAmountCents: true, createdAt: true, fundName: true, finixTransferId: true, status: true },
    }),
    prisma.finixSubscription.findMany({
      where: { churchId, donorId: { in: donorIds } },
      select: { donorId: true, state: true, canceledAt: true, completedAt: true, amountCents: true, billingInterval: true },
    }),
  ]);

  const transferIds = payments.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id));
  const [refundRows, returnRows] = transferIds.length
    ? await Promise.all([
        prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds } }, select: { finixOriginalTransferId: true, amountCents: true, state: true } }),
        prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } }, select: { originalTransferId: true, amountCents: true } }),
      ])
    : [[], []];
  const refundsBy = new Map<string, Array<{ amountCents: number | null; state: string | null }>>();
  for (const r of refundRows) if (r.finixOriginalTransferId) refundsBy.set(r.finixOriginalTransferId, [...(refundsBy.get(r.finixOriginalTransferId) ?? []), r]);
  const returnedBy = new Map<string, number>();
  for (const r of returnRows) if (r.originalTransferId) returnedBy.set(r.originalTransferId, (returnedBy.get(r.originalTransferId) ?? 0) + (r.amountCents ?? 0));

  const giftsBy = new Map<string, GiftForSummary[]>();
  for (const p of payments) {
    if (!p.donorId) continue;
    const charged = p.amountCents;
    const gift = p.donationAmountCents ?? p.amountCents;
    let net = gift;
    if (p.status === "RETURNED") net = 0;
    else if (p.finixTransferId) {
      const returned = returnedBy.get(p.finixTransferId) ?? 0;
      const refunded = computeRefundStatus({ amountCents: charged }, refundsBy.get(p.finixTransferId) ?? []).refundedCents;
      // Money taken back from the charge comes out of the gift (a covered fee is refunded last, so this never under-counts).
      if (returned >= charged || refunded >= charged) net = 0;
      else net = Math.max(gift - refunded - returned, 0);
    }
    giftsBy.set(p.donorId, [...(giftsBy.get(p.donorId) ?? []), { netCents: net, createdAt: p.createdAt, fundName: p.fundName }]);
  }

  const recurringBy = new Map<string, string[]>();
  for (const s of subscriptions) {
    if (!s.donorId) continue;
    if (resolveSubscriptionDisplayStatus({ rawState: s.state, canceledAt: s.canceledAt, completedAt: s.completedAt }) !== "ACTIVE") continue;
    recurringBy.set(s.donorId, [...(recurringBy.get(s.donorId) ?? []), `${money(s.amountCents ?? 0)} ${frequencyLabel(s.billingInterval)}`]);
  }

  for (const donorId of donorIds) {
    const labels = recurringBy.get(donorId);
    result.set(donorId, summarizeGifts(giftsBy.get(donorId) ?? [], labels?.length ? `Yes — ${labels.join("; ")}` : "No", now));
  }
  return result;
}
