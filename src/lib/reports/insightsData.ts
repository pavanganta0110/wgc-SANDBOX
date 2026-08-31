import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { startOfDayCentral } from "@/lib/formatDateTimeCDT";
import { EXCLUDE_NON_DONATION_TRANSFERS } from "@/lib/auth/scopes";

const CENTRAL_TIME_ZONE = "America/Chicago";

export interface TrendPoint {
  label: string;
  values: Record<string, number>;
}

const TREND_CONFIG: Record<string, { buckets: number; stepDays: number; format: Intl.DateTimeFormatOptions }> = {
  daily: { buckets: 14, stepDays: 1, format: { month: "short", day: "numeric" } },
  weekly: { buckets: 6, stepDays: 7, format: { month: "short", day: "numeric" } },
  monthly: { buckets: 6, stepDays: 30, format: { month: "short" } },
};

// Central-time calendar-month boundaries — a fixed 30-day step drifts
// against real months (a 31-day month pushes every later bucket a day
// earlier), which visibly duplicated "Jul" as two different buckets with
// different data. Months have no fixed length, so they can't be stepped
// like days/weeks can.
function startOfMonthCentral(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  // Noon UTC keeps this safely within the 1st in Central time regardless of
  // CST/CDT offset (at most UTC-6) — startOfDayCentral then re-derives the
  // true Central midnight from it.
  return startOfDayCentral(new Date(Date.UTC(year, month - 1, 1, 12)));
}

function groupTrend<T extends { createdAtFinix: Date | null; amountCents: number | null; series: string }>(
  records: T[],
  trend: string,
  seriesKeys: string[],
  mode: "sum" | "count" = "sum"
): TrendPoint[] {
  const config = TREND_CONFIG[trend] ?? TREND_CONFIG.weekly;
  const now = new Date();
  const buckets: TrendPoint[] = [];

  for (let i = config.buckets - 1; i >= 0; i--) {
    let periodStart: Date;
    let periodEnd: Date;
    if (trend === "monthly") {
      const anchor = startOfMonthCentral(now);
      periodStart = new Date(anchor);
      periodStart.setMonth(periodStart.getMonth() - i);
      periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      const dayOffset = new Date(now);
      dayOffset.setDate(now.getDate() - i * config.stepDays);
      periodStart = startOfDayCentral(dayOffset);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + config.stepDays);
    }

    const values: Record<string, number> = {};
    for (const key of seriesKeys) values[key] = 0;

    for (const r of records) {
      if (r.createdAtFinix && r.createdAtFinix >= periodStart && r.createdAtFinix < periodEnd) {
        values[r.series] =
          (values[r.series] ?? 0) + (mode === "count" ? 1 : (r.amountCents ?? 0) / 100);
      }
    }

    buckets.push({
      label: periodStart.toLocaleDateString("en-US", { ...config.format, timeZone: CENTRAL_TIME_ZONE }),
      values,
    });
  }

  return buckets;
}

async function getInstrumentMap(churchId: string) {
  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { churchId } });
  return new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));
}

/**
 * Team-access: FinixTransfer/FinixRefundOrReversal/FinixDispute/BankReturn
 * carry no attribution of their own — bridged through
 * Payment.attributedUserId via finixTransferId, same pattern used
 * elsewhere (buildFinixTransferScope, donorTabs.ts resolveScopedTransferIds).
 * undefined = organization scope, no filter applied.
 */
export async function resolveScopedTransferIds(churchId: string, attributedUserId: string | undefined): Promise<string[] | undefined> {
  if (!attributedUserId) return undefined;
  const ownPayments = await prisma.payment.findMany({
    where: { churchId, attributedUserId, finixTransferId: { not: null } },
    select: { finixTransferId: true },
  });
  return ownPayments.map((p) => p.finixTransferId!).filter(Boolean);
}

// "Card Type" and "Card Issuer Country" aren't captured anywhere in our
// synced Finix data yet (FinixPaymentInstrumentSnapshot has no such
// fields) — grouping by them will show everything under UNKNOWN until
// that's added, rather than fabricate values.
export const PAYMENT_DIMENSIONS = [
  { key: "cardBrand", label: "Card Brand" },
  { key: "cardType", label: "Card Type" },
  { key: "cardIssuerCountry", label: "Card Issuer Country" },
  { key: "paymentChannel", label: "Payment Channel" },
] as const;

export type PaymentDimensionKey = (typeof PAYMENT_DIMENSIONS)[number]["key"];

export function dimensionValue(
  instrument: { cardBrand: string | null; paymentMethodType: string | null } | undefined,
  dimension: PaymentDimensionKey
): string {
  switch (dimension) {
    case "cardBrand":
      // A bank-account instrument legitimately has no cardBrand — it isn't
      // a card at all, so it shouldn't fall into the same UNKNOWN bucket as
      // a card whose brand genuinely wasn't captured.
      if (instrument?.paymentMethodType === "BANK_ACCOUNT") return "ACH";
      return instrument?.cardBrand ?? "UNKNOWN";
    case "paymentChannel":
      return instrument?.paymentMethodType ?? "UNKNOWN";
    case "cardType":
    case "cardIssuerCountry":
    default:
      return "UNKNOWN";
  }
}

export async function getPaymentsInsights(
  churchId: string,
  dateFilter: { gte: Date; lte?: Date } | undefined,
  trend: string,
  dimension: PaymentDimensionKey = "cardBrand",
  attributedUserId?: string
) {
  const scopedTransferIds = await resolveScopedTransferIds(churchId, attributedUserId);
  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      ...EXCLUDE_NON_DONATION_TRANSFERS,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { finixTransferId: { in: scopedTransferIds } } : {}),
    },
  });
  const instrumentMap = await getInstrumentMap(churchId);

  const succeeded = transfers.filter((t) => (t.state || "").toUpperCase() === "SUCCEEDED");
  const failed = transfers.filter((t) => (t.state || "").toUpperCase() === "FAILED");
  const totalVolumeCents = succeeded.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
  const failedVolumeCents = failed.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
  const avgCents = succeeded.length > 0 ? totalVolumeCents / succeeded.length : 0;

  const summary = [
    { label: "Total Transaction Volume", value: formatCents(totalVolumeCents) },
    { label: "Successful Sales", value: formatCents(totalVolumeCents) },
    { label: "Failed Sales", value: formatCents(failedVolumeCents) },
    { label: "Avg. Transaction Amount", value: formatCents(avgCents) },
  ];

  const methodSeries = transfers.map((t) => ({
    createdAtFinix: t.createdAtFinix,
    amountCents: t.amountCents,
    series: instrumentMap.get(t.finixPaymentInstrumentId ?? "")?.paymentMethodType ?? "UNKNOWN",
  }));
  const methodKeys = Array.from(new Set(methodSeries.map((s) => s.series)));
  const byMethod = groupTrend(methodSeries, trend, methodKeys, "sum");
  const byMethodCount = groupTrend(methodSeries, trend, methodKeys, "count");

  const brandSeries = transfers.map((t) => ({
    createdAtFinix: t.createdAtFinix,
    amountCents: t.amountCents,
    series: dimensionValue(instrumentMap.get(t.finixPaymentInstrumentId ?? ""), "cardBrand"),
  }));
  const brandKeys = Array.from(new Set(brandSeries.map((s) => s.series)));
  const byBrand = groupTrend(brandSeries, trend, brandKeys, "sum");
  const byBrandCount = groupTrend(brandSeries, trend, brandKeys, "count");

  const byBrandTable = Array.from(
    transfers.reduce((map, t) => {
      const key = dimensionValue(instrumentMap.get(t.finixPaymentInstrumentId ?? ""), dimension);
      const entry = map.get(key) ?? { volume: 0, count: 0, failedVolume: 0, failedCount: 0 };
      entry.volume += (t.state || "").toUpperCase() === "SUCCEEDED" ? t.amountCents ?? 0 : 0;
      entry.count += (t.state || "").toUpperCase() === "SUCCEEDED" ? 1 : 0;
      entry.failedVolume += (t.state || "").toUpperCase() === "FAILED" ? t.amountCents ?? 0 : 0;
      entry.failedCount += (t.state || "").toUpperCase() === "FAILED" ? 1 : 0;
      map.set(key, entry);
      return map;
    }, new Map<string, { volume: number; count: number; failedVolume: number; failedCount: number }>())
  ).map(([brand, v]) => ({
    brand,
    volume: formatCents(v.volume),
    volumeCents: v.volume,
    count: v.count,
    failedVolume: formatCents(v.failedVolume),
    failedVolumeCents: v.failedVolume,
    failedCount: v.failedCount,
    successRatio: v.count + v.failedCount > 0 ? `${((v.count / (v.count + v.failedCount)) * 100).toFixed(2)}%` : "—",
  }));

  return {
    summary,
    byMethod,
    byMethodCount,
    byBrand,
    byBrandCount,
    byBrandTable,
    hasData: transfers.length > 0,
  };
}

export async function getAuthorizationsInsights(
  churchId: string,
  dateFilter: { gte: Date; lte?: Date } | undefined,
  trend: string,
  dimension: PaymentDimensionKey = "cardBrand",
  attributedUserId?: string
) {
  const scopedTransferIds = await resolveScopedTransferIds(churchId, attributedUserId);
  const authorizations = await prisma.finixAuthorization.findMany({
    where: {
      churchId,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      // Only captured authorizations (finixTransferId set) can ever be
      // bridged to an attributed Payment — a scoped view excludes
      // voided/expired ones rather than guess who they belong to.
      ...(scopedTransferIds ? { finixTransferId: { in: scopedTransferIds } } : {}),
    },
  });
  const transferIds = authorizations.map((a) => a.finixTransferId).filter((id): id is string => Boolean(id));
  const transfers = transferIds.length
    ? await prisma.finixTransfer.findMany({ where: { finixTransferId: { in: transferIds } } })
    : [];
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));
  const instrumentMap = await getInstrumentMap(churchId);

  const brandOf = (a: (typeof authorizations)[number]) => {
    const transfer = a.finixTransferId ? transferMap.get(a.finixTransferId) : undefined;
    return dimensionValue(instrumentMap.get(transfer?.finixPaymentInstrumentId ?? ""), "cardBrand");
  };

  const dimensionOf = (a: (typeof authorizations)[number]) => {
    const transfer = a.finixTransferId ? transferMap.get(a.finixTransferId) : undefined;
    return dimensionValue(instrumentMap.get(transfer?.finixPaymentInstrumentId ?? ""), dimension);
  };

  const approved = authorizations.filter((a) => (a.state || "").toUpperCase() === "SUCCEEDED");
  const voided = authorizations.filter((a) => Boolean(a.isVoid));
  const requestedVolumeCents = authorizations.reduce((sum, a) => sum + (a.amountRequestedCents ?? 0), 0);
  const capturedVolumeCents = approved.reduce((sum, a) => sum + (a.amountCents ?? 0), 0);
  const authRate = authorizations.length > 0 ? (approved.length / authorizations.length) * 100 : 0;

  const summary = [
    { label: "Requests Received", value: formatCents(requestedVolumeCents) },
    { label: "Authorization Rate", value: `${authRate.toFixed(2)}%` },
    { label: "Voided Authorizations", value: formatCents(voided.reduce((s, a) => s + (a.amountCents ?? 0), 0)) },
    { label: "Captured Authorizations", value: formatCents(capturedVolumeCents) },
  ];

  const byBrand = groupTrend(
    authorizations.map((a) => ({
      createdAtFinix: a.createdAtFinix,
      amountCents: a.amountCents,
      series: brandOf(a),
    })),
    trend,
    Array.from(new Set(authorizations.map(brandOf)))
  );

  const byBrandTable = Array.from(
    authorizations.reduce((map, a) => {
      const key = dimensionOf(a);
      const entry = map.get(key) ?? { received: 0, authorized: 0, voided: 0, authorizedAmount: 0 };
      entry.received += 1;
      if ((a.state || "").toUpperCase() === "SUCCEEDED") {
        entry.authorized += 1;
        entry.authorizedAmount += a.amountCents ?? 0;
      }
      if (a.isVoid) entry.voided += 1;
      map.set(key, entry);
      return map;
    }, new Map<string, { received: number; authorized: number; voided: number; authorizedAmount: number }>())
  ).map(([brand, v]) => ({
    brand,
    received: v.received,
    authorized: v.authorized,
    voided: v.voided,
    authorizedAmount: v.authorizedAmount / 100,
    rate: v.received > 0 ? (v.authorized / v.received).toFixed(3) : "—",
    rateValue: v.received > 0 ? v.authorized / v.received : 0,
  }));

  return { summary, byBrand, byBrandTable, hasData: authorizations.length > 0 };
}

export async function getRefundsInsights(
  churchId: string,
  dateFilter: { gte: Date; lte?: Date } | undefined,
  trend: string,
  dimension: PaymentDimensionKey = "cardBrand",
  attributedUserId?: string
) {
  const scopedTransferIds = await resolveScopedTransferIds(churchId, attributedUserId);
  const refunds = await prisma.finixRefundOrReversal.findMany({
    where: {
      churchId,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { finixOriginalTransferId: { in: scopedTransferIds } } : {}),
    },
  });
  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      ...EXCLUDE_NON_DONATION_TRANSFERS,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { finixTransferId: { in: scopedTransferIds } } : {}),
    },
  });
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));
  const instrumentMap = await getInstrumentMap(churchId);

  const dimensionOf = (r: (typeof refunds)[number]) => {
    const transfer = r.finixOriginalTransferId ? transferMap.get(r.finixOriginalTransferId) : undefined;
    return dimensionValue(instrumentMap.get(transfer?.finixPaymentInstrumentId ?? ""), dimension);
  };

  const succeeded = refunds.filter((r) => (r.state || "").toUpperCase() === "SUCCEEDED");
  const failed = refunds.filter((r) => (r.state || "").toUpperCase() === "FAILED");
  const grossVolumeCents = transfers
    .filter((t) => (t.state || "").toUpperCase() === "SUCCEEDED")
    .reduce((sum, t) => sum + (t.amountCents ?? 0), 0);

  const summary = [
    { label: "Gross Processing Volume", value: formatCents(grossVolumeCents) },
    { label: "Successful Refunds", value: formatCents(succeeded.reduce((s, r) => s + (r.amountCents ?? 0), 0)) },
    { label: "Failed Refunds", value: formatCents(failed.reduce((s, r) => s + (r.amountCents ?? 0), 0)) },
    { label: "Total Transaction Volume", value: formatCents(grossVolumeCents) },
  ];

  const byStatus = groupTrend(
    refunds.map((r) => ({
      createdAtFinix: r.createdAtFinix,
      amountCents: r.amountCents,
      series: r.state || "UNKNOWN",
    })),
    trend,
    Array.from(new Set(refunds.map((r) => r.state || "UNKNOWN")))
  );

  const byBrandTable = Array.from(
    refunds.reduce((map, r) => {
      const key = dimensionOf(r);
      const entry = map.get(key) ?? { volume: 0, count: 0, failedVolume: 0, failedCount: 0 };
      entry.volume += (r.state || "").toUpperCase() === "SUCCEEDED" ? r.amountCents ?? 0 : 0;
      entry.count += (r.state || "").toUpperCase() === "SUCCEEDED" ? 1 : 0;
      entry.failedVolume += (r.state || "").toUpperCase() === "FAILED" ? r.amountCents ?? 0 : 0;
      entry.failedCount += (r.state || "").toUpperCase() === "FAILED" ? 1 : 0;
      map.set(key, entry);
      return map;
    }, new Map<string, { volume: number; count: number; failedVolume: number; failedCount: number }>())
  ).map(([brand, v]) => ({
    brand,
    volume: formatCents(v.volume),
    volumeCents: v.volume,
    count: v.count,
    failedVolume: formatCents(v.failedVolume),
    failedVolumeCents: v.failedVolume,
    failedCount: v.failedCount,
    successRatio: v.count + v.failedCount > 0 ? `${((v.count / (v.count + v.failedCount)) * 100).toFixed(2)}%` : "—",
  }));

  return { summary, byStatus, byBrandTable, hasData: refunds.length > 0 };
}

export async function getDisputesInsights(
  churchId: string,
  dateFilter: { gte: Date; lte?: Date } | undefined,
  trend: string,
  dimension: PaymentDimensionKey = "cardBrand",
  attributedUserId?: string
) {
  const scopedTransferIds = await resolveScopedTransferIds(churchId, attributedUserId);
  const disputes = await prisma.finixDispute.findMany({
    where: {
      churchId,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { finixTransferId: { in: scopedTransferIds } } : {}),
    },
  });
  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      ...EXCLUDE_NON_DONATION_TRANSFERS,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { finixTransferId: { in: scopedTransferIds } } : {}),
    },
  });
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));
  const instrumentMap = await getInstrumentMap(churchId);

  const dimensionOf = (d: (typeof disputes)[number]) => {
    const transfer = d.finixTransferId ? transferMap.get(d.finixTransferId) : undefined;
    return dimensionValue(instrumentMap.get(transfer?.finixPaymentInstrumentId ?? ""), dimension);
  };

  const totalDisputedVolumeCents = disputes.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);
  const activeVolumeCents = disputes
    .filter((d) => (d.state || "").toLowerCase() === "pending")
    .reduce((sum, d) => sum + (d.amountCents ?? 0), 0);
  const disputeRate = transfers.length > 0 ? (disputes.length / transfers.length) * 100 : 0;
  const totalVolumeCents = transfers
    .filter((t) => (t.state || "").toUpperCase() === "SUCCEEDED")
    .reduce((sum, t) => sum + (t.amountCents ?? 0), 0);

  const summary = [
    { label: "Total Disputed Volume", value: formatCents(totalDisputedVolumeCents) },
    { label: "Dispute Ratio", value: `${disputeRate.toFixed(2)}%` },
    { label: "Active Dispute Volume", value: formatCents(activeVolumeCents) },
    { label: "Total Transaction Volume", value: formatCents(totalVolumeCents) },
  ];

  const byReason = groupTrend(
    disputes.map((d) => ({
      createdAtFinix: d.createdAtFinix,
      amountCents: d.amountCents,
      series: d.reason || "UNKNOWN",
    })),
    trend,
    Array.from(new Set(disputes.map((d) => d.reason || "UNKNOWN")))
  );

  const byBrandTable = Array.from(
    disputes.reduce((map, d) => {
      const key = dimensionOf(d);
      const entry = map.get(key) ?? { count: 0, volume: 0 };
      entry.count += 1;
      entry.volume += d.amountCents ?? 0;
      map.set(key, entry);
      return map;
    }, new Map<string, { count: number; volume: number }>())
  ).map(([brand, v]) => ({
    brand,
    count: v.count,
    volume: formatCents(v.volume),
    volumeCents: v.volume,
  }));

  return { summary, byReason, byBrandTable, hasData: disputes.length > 0 };
}

export async function getBankReturnsInsights(
  churchId: string,
  dateFilter: { gte: Date; lte?: Date } | undefined,
  trend: string,
  attributedUserId?: string
) {
  // ACH volume is every card-less (bank) transfer in the period; returns are
  // sourced from the dedicated BankReturn table (real NACHA return records,
  // synced from Finix's return-subtype Transfer webhooks) rather than the
  // old heuristic of scanning FinixTransfer.subtype at read time.
  const scopedTransferIds = await resolveScopedTransferIds(churchId, attributedUserId);
  const achTransfers = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      finixPaymentInstrumentId: { not: null },
      ...EXCLUDE_NON_DONATION_TRANSFERS,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { finixTransferId: { in: scopedTransferIds } } : {}),
    },
  });
  const returns = await prisma.bankReturn.findMany({
    where: {
      churchId,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { originalTransferId: { in: scopedTransferIds } } : {}),
    },
  });

  const grossAchVolumeCents = achTransfers.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
  const returnedAchVolumeCents = returns.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const netAchVolumeCents = grossAchVolumeCents - returnedAchVolumeCents;
  const returnRate = achTransfers.length > 0 ? (returns.length / achTransfers.length) * 100 : 0;

  const summary = [
    { label: "Gross ACH Volume", value: formatCents(grossAchVolumeCents) },
    { label: "Returned ACH Amount", value: formatCents(returnedAchVolumeCents) },
    { label: "Net ACH Volume", value: formatCents(netAchVolumeCents) },
    { label: "ACH Return Rate", value: `${returnRate.toFixed(2)}% (${returns.length} of ${achTransfers.length})` },
  ];

  const trendData = groupTrend(
    returns.map((r) => ({ createdAtFinix: r.createdAtFinix, amountCents: r.amountCents, series: "Total Volume" })),
    trend,
    ["Total Volume"]
  );

  const byReasonTable = Array.from(
    returns.reduce((map, r) => {
      const reason = r.reasonCode || "UNKNOWN";
      const entry = map.get(reason) ?? { volume: 0, count: 0 };
      entry.volume += r.amountCents ?? 0;
      entry.count += 1;
      map.set(reason, entry);
      return map;
    }, new Map<string, { volume: number; count: number }>())
  ).map(([reason, v]) => ({
    reason,
    volume: formatCents(v.volume),
    volumeCents: v.volume,
    count: v.count,
    pctOfReturns: returns.length > 0 ? `${((v.count / returns.length) * 100).toFixed(2)}%` : "—",
  }));

  return { summary, trendData, byReasonTable, hasData: returns.length > 0 };
}

export async function getDepositsInsights(churchId: string, dateFilter: { gte: Date; lte?: Date } | undefined, trend: string) {
  const deposits = await prisma.finixFundingTransferAttempt.findMany({
    where: { churchId, ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
  });

  // Finix's real funding-transfer state is "SUCCEEDED", not "COMPLETED" —
  // same mismatch already fixed in bankAccountResolver.ts and the deposit
  // detail pages' Transaction Flow steps.
  const completed = deposits.filter((d) => ["COMPLETED", "SUCCEEDED"].includes((d.state || "").toUpperCase()));
  const pending = deposits.filter((d) => ["PENDING", "PROCESSING", "SENT"].includes((d.state || "").toUpperCase()));
  const failed = deposits.filter((d) => ["FAILED", "RETURNED", "CANCELED"].includes((d.state || "").toUpperCase()));

  const totalDepositedCents = deposits.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);
  const netDepositedCents = deposits.reduce((sum, d) => sum + (d.netAmountCents ?? d.amountCents ?? 0), 0);
  const pendingCents = pending.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);
  const completedCents = completed.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);
  const failedCents = failed.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);
  const avgDepositCents = deposits.length > 0 ? Math.round(totalDepositedCents / deposits.length) : 0;

  const summary = [
    { label: "Total Deposited", value: formatCents(totalDepositedCents) },
    { label: "Pending Deposits", value: `${formatCents(pendingCents)} (${pending.length})` },
    { label: "Completed Deposits", value: `${formatCents(completedCents)} (${completed.length})` },
    { label: "Failed Deposits", value: `${formatCents(failedCents)} (${failed.length})` },
    { label: "Average Deposit Amount", value: formatCents(avgDepositCents) },
    { label: "Net Deposited Amount", value: formatCents(netDepositedCents) },
  ];

  const trendData = groupTrend(
    deposits.map((d) => ({ createdAtFinix: d.createdAtFinix, amountCents: d.amountCents, series: "Deposit Volume" })),
    trend,
    ["Deposit Volume"]
  );

  const countTrendData = groupTrend(
    deposits.map((d) => ({ createdAtFinix: d.createdAtFinix, amountCents: d.amountCents, series: "Deposit Count" })),
    trend,
    ["Deposit Count"],
    "count"
  );

  return { summary, trendData, countTrendData, hasData: deposits.length > 0 };
}

/**
 * Reporting for "Record External Donation" entries — deliberately never
 * joins Finix transfer/settlement/fee tables, so this can never contribute
 * to Finix processing volume or WGC processing-fee totals. The WGC total
 * is a separate, minimal query (same eligibility rule as getPaymentsInsights'
 * successful-transfer total) included only so the two can be shown side by
 * side without conflating them.
 */
export interface ExternalDonationsInsightsFilters {
  paymentMethod?: string;
  receiptStatus?: string;
  fundId?: string;
  /** "manual" | "imported" | undefined (both) */
  source?: string;
}

export async function getExternalDonationsInsights(
  churchId: string,
  dateFilter: { gte: Date; lte?: Date } | undefined,
  attributedUserId?: string,
  filters: ExternalDonationsInsightsFilters = {}
) {
  const rows = await prisma.externalDonation.findMany({
    where: {
      churchId,
      status: { not: "VOIDED" },
      ...(dateFilter ? { donationDate: dateFilter } : {}),
      // scopedUserId (passed as attributedUserId, same param name the other
      // getXInsights functions in this file use) restricts a FUNDRAISER/
      // VIEWER without canViewAllTransactions to donations they personally
      // recorded — same rule as every other tab on this page.
      ...(attributedUserId ? { createdByUserId: attributedUserId } : {}),
      ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
      ...(filters.receiptStatus ? { receiptStatus: filters.receiptStatus === "NOT_SENT" ? null : filters.receiptStatus } : {}),
      ...(filters.fundId ? { fundId: filters.fundId } : {}),
      ...(filters.source === "manual" ? { importBatchId: null } : filters.source === "imported" ? { importBatchId: { not: null } } : {}),
    },
  });
  const active = rows.filter((d) => d.depositStatus !== "RETURNED");

  const bySource = new Map<string, { totalCents: number; count: number }>();
  const byFund = new Map<string, { totalCents: number; count: number }>();
  for (const d of active) {
    const sourceAcc = bySource.get(d.source) ?? { totalCents: 0, count: 0 };
    sourceAcc.totalCents += d.donationAmountCents;
    sourceAcc.count += 1;
    bySource.set(d.source, sourceAcc);

    const fundLabel = d.fundName || "No fund";
    const fundAcc = byFund.get(fundLabel) ?? { totalCents: 0, count: 0 };
    fundAcc.totalCents += d.donationAmountCents;
    fundAcc.count += 1;
    byFund.set(fundLabel, fundAcc);
  }
  const totalExternalCents = active.reduce((sum, d) => sum + d.donationAmountCents, 0);

  // The WGC-processed comparison total is a fixed organization-wide figure
  // for the period — it never reflects the external-only filters above
  // (payment method, fund, receipt status, source), which don't apply to
  // Finix transfers.
  const scopedTransferIds = await resolveScopedTransferIds(churchId, attributedUserId);
  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      ...EXCLUDE_NON_DONATION_TRANSFERS,
      state: "SUCCEEDED",
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
      ...(scopedTransferIds ? { finixTransferId: { in: scopedTransferIds } } : {}),
    },
    select: { amountCents: true },
  });
  const totalWgcCents = transfers.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);

  const summary = [
    { label: "WGC-Processed Donations", value: formatCents(totalWgcCents) },
    { label: "External Donations", value: formatCents(totalExternalCents) },
    { label: "Combined Total Donations", value: formatCents(totalWgcCents + totalExternalCents) },
    { label: "External Donation Count", value: String(active.length) },
  ];

  const bySourceTable = [...bySource.entries()]
    .map(([source, v]) => ({ source, totalCents: v.totalCents, count: v.count }))
    .sort((a, b) => b.totalCents - a.totalCents);

  const byFundTable = [...byFund.entries()]
    .map(([fund, v]) => ({ fund, totalCents: v.totalCents, count: v.count }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return { summary, bySourceTable, byFundTable, totalWgcCents, totalExternalCents, hasData: active.length > 0 };
}
