import { prisma } from "@/lib/prisma";
import { startOfDayCentral } from "@/lib/formatDateTimeCDT";
import { formatPersonName } from "@/lib/formatPersonName";
import { externalDonationEligibilityWhere, isExternalDonationDeposited } from "@/lib/donors/donorAggregates";
import type { DateRangeFilter } from "@/lib/donors/donorAggregates";

const CENTRAL_TIME_ZONE = "America/Chicago";

// Central-time calendar-month boundaries — a fixed 30-day step drifts
// against real months (a 31-day month pushes every later bucket a day
// earlier), which visibly duplicates a month label across two buckets
// with different data. Mirrors the same fix in
// src/lib/reports/insightsData.ts and the dashboard page.
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

export interface TrendPoint {
  period: string;
  grossDonatedCents: number;
  refundedAmountCents: number;
  returnedAmountCents: number;
  netDonatedCents: number;
  donationCount: number;
  uniqueDonorCount: number;
  /** Split of grossDonatedCents/donationCount by source, for the "WGC
   * processed vs external" trend breakdown. */
  wgcDonatedCents: number;
  externalDonatedCents: number;
  wgcDonationCount: number;
  externalDonationCount: number;
}

export type TrendSourceFilter = "all" | "wgc" | "external";

/**
 * Fetches every successful transfer/refund/return AND every eligible
 * ExternalDonation in the date-bounded window once, then buckets in memory
 * — the same "date-bounded query, bucket in JS" pattern already used by
 * src/lib/reports/insightsData.ts's groupTrend, not a new convention.
 * Bounded by the date range (not by an arbitrary row cap), consistent with
 * how every other Insights tab in this app already works.
 *
 * External donations bucket by the actual donationDate (the date the gift
 * was received), never by the row's createdAt/import timestamp — an
 * imported batch of December gifts entered in March still lands in
 * December's bucket, matching how the donor-list/profile totals already
 * treat donationDate as the source of truth (see donorAggregates.ts).
 * Eligibility (status !== VOIDED, depositStatus !== RETURNED) is the same
 * externalDonationEligibilityWhere every other reader of this table uses,
 * so a void/return here also disappears from the trend, not just the total.
 */
export async function loadDonationTrend(
  churchId: string,
  dateFilter: DateRangeFilter | undefined,
  granularity: "daily" | "weekly" | "monthly",
  donorIdIn?: string[],
  sourceFilter: TrendSourceFilter = "all",
): Promise<TrendPoint[]> {
  const instruments =
    sourceFilter === "external"
      ? []
      : await prisma.finixPaymentInstrumentSnapshot.findMany({
          where: {
            churchId,
            donorId: donorIdIn ? { in: donorIdIn } : { not: null },
          },
          select: { finixPaymentInstrumentId: true, donorId: true },
        });
  const instrumentToDonor = new Map(
    instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]),
  );
  const instrumentIds = [...instrumentToDonor.keys()];

  const [transfers, externalDonations] = await Promise.all([
    sourceFilter !== "external" && instrumentIds.length
      ? prisma.finixTransfer.findMany({
          where: {
            churchId,
            finixPaymentInstrumentId: { in: instrumentIds },
            state: "SUCCEEDED",
            ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
          },
          select: {
            finixTransferId: true,
            finixPaymentInstrumentId: true,
            amountCents: true,
            createdAtFinix: true,
          },
        })
      : Promise.resolve([]),
    sourceFilter !== "wgc"
      ? prisma.externalDonation
          .findMany({
            where: externalDonationEligibilityWhere(churchId, {
              donorIds: donorIdIn,
              dateFilter,
            }),
            select: {
              donorId: true,
              donationAmountCents: true,
              donationDate: true,
              depositStatus: true,
            },
          })
          .then((rows) => rows.filter(isExternalDonationDeposited))
      : Promise.resolve([]),
  ]);
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [refunds, bankReturns] = await Promise.all([
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({
          where: {
            churchId,
            finixOriginalTransferId: { in: transferIds },
            state: "SUCCEEDED",
          },
          select: {
            finixOriginalTransferId: true,
            amountCents: true,
            createdAtFinix: true,
          },
        })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.bankReturn.findMany({
          where: { churchId, originalTransferId: { in: transferIds } },
          select: {
            originalTransferId: true,
            amountCents: true,
            createdAtFinix: true,
          },
        })
      : Promise.resolve([]),
  ]);

  if (instrumentIds.length === 0 && externalDonations.length === 0) return [];

  const bucketCount =
    granularity === "daily" ? 30 : granularity === "weekly" ? 12 : 12;
  const stepDays =
    granularity === "daily" ? 1 : granularity === "weekly" ? 7 : 30;
  const labelFormat: Intl.DateTimeFormatOptions =
    granularity === "monthly"
      ? { month: "short", year: "2-digit" }
      : { month: "short", day: "numeric" };

  const now = dateFilter?.lte ?? new Date();
  const buckets: TrendPoint[] = [];

  for (let i = bucketCount - 1; i >= 0; i--) {
    let periodStart: Date;
    let periodEnd: Date;
    if (granularity === "monthly") {
      const anchor = startOfMonthCentral(now);
      periodStart = new Date(anchor);
      periodStart.setMonth(periodStart.getMonth() - i);
      periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      const dayOffset = new Date(now);
      dayOffset.setDate(now.getDate() - i * stepDays);
      periodStart = startOfDayCentral(dayOffset);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + stepDays);
    }

    if (dateFilter?.gte && periodEnd < dateFilter.gte) continue;

    const periodTransfers = transfers.filter(
      (t) =>
        t.createdAtFinix &&
        t.createdAtFinix >= periodStart &&
        t.createdAtFinix < periodEnd,
    );
    const periodTransferIds = new Set(
      periodTransfers.map((t) => t.finixTransferId),
    );
    const periodExternal = externalDonations.filter(
      (d) => d.donationDate >= periodStart && d.donationDate < periodEnd,
    );

    const wgcDonatedCents = periodTransfers.reduce(
      (sum, t) => sum + (t.amountCents ?? 0),
      0,
    );
    const externalDonatedCents = periodExternal.reduce(
      (sum, d) => sum + d.donationAmountCents,
      0,
    );
    const grossDonatedCents = wgcDonatedCents + externalDonatedCents;
    const refundedAmountCents = refunds
      .filter(
        (r) =>
          r.finixOriginalTransferId &&
          periodTransferIds.has(r.finixOriginalTransferId),
      )
      .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
    const returnedAmountCents = bankReturns
      .filter(
        (r) =>
          r.originalTransferId && periodTransferIds.has(r.originalTransferId),
      )
      .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
    const uniqueDonors = new Set([
      ...periodTransfers
        .map((t) =>
          t.finixPaymentInstrumentId
            ? instrumentToDonor.get(t.finixPaymentInstrumentId)
            : undefined,
        )
        .filter(Boolean),
      ...periodExternal.map((d) => d.donorId).filter(Boolean),
    ]);

    buckets.push({
      period: periodStart.toLocaleDateString("en-US", {
        ...labelFormat,
        timeZone: CENTRAL_TIME_ZONE,
      }),
      grossDonatedCents,
      refundedAmountCents,
      returnedAmountCents,
      netDonatedCents:
        grossDonatedCents - refundedAmountCents - returnedAmountCents,
      donationCount: periodTransfers.length + periodExternal.length,
      uniqueDonorCount: uniqueDonors.size,
      wgcDonatedCents,
      externalDonatedCents,
      wgcDonationCount: periodTransfers.length,
      externalDonationCount: periodExternal.length,
    });
  }

  return buckets;
}

export type TopDonorMetric = "gross" | "net" | "count" | "recurring";

export interface TopDonorRow {
  donorId: string;
  name: string;
  isAnonymous: boolean;
  metricValueCents: number;
  donationCount: number;
  lastDonationAt: Date | null;
  isRecurring: boolean;
  isAtRisk: boolean;
  shareOfTotal: number;
}

/**
 * One grouped query over the (date-bounded, or lifetime when no filter is
 * given) transfer + external-donation set, ranked by the selected metric —
 * grouped by canonical Donor.id, so a donor who gave via Google Pay AND cash
 * appears once with the combined total, never as two rows. "Recurring
 * Value" is monthly-normalized per spec: weekly*52/12, biweekly*26/12,
 * monthly as-is, quarterly/3, yearly/12. Recurring giving is inherently a
 * WGC-processed (FinixSubscription) concept — there is no equivalent
 * "recurring" signal for offline/external donations to fold in here.
 */
export async function loadTopDonors(
  churchId: string,
  dateFilter: DateRangeFilter | undefined,
  metric: TopDonorMetric,
  limit: number,
  donorIdIn?: string[],
): Promise<{ rows: TopDonorRow[]; totalForMetricCents: number }> {
  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: donorIdIn ? { in: donorIdIn } : { not: null } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentToDonor = new Map(
    instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]),
  );
  const instrumentIds = [...instrumentToDonor.keys()];

  if (metric === "recurring") {
    if (instrumentIds.length === 0) return { rows: [], totalForMetricCents: 0 };
    const subs = await prisma.finixSubscription.findMany({
      where: {
        churchId,
        finixPaymentInstrumentId: { in: instrumentIds },
        state: "ACTIVE",
      },
      select: {
        finixPaymentInstrumentId: true,
        amountCents: true,
        billingInterval: true,
      },
    });
    const monthlyByDonor = new Map<string, number>();
    for (const s of subs) {
      const donorId = s.finixPaymentInstrumentId
        ? instrumentToDonor.get(s.finixPaymentInstrumentId)
        : undefined;
      if (!donorId) continue;
      monthlyByDonor.set(
        donorId,
        (monthlyByDonor.get(donorId) ?? 0) +
          normalizeToMonthly(s.amountCents ?? 0, s.billingInterval),
      );
    }
    const donors = await prisma.donor.findMany({
      where: { id: { in: [...monthlyByDonor.keys()] }, churchId },
    });
    const donorMap = new Map(donors.map((d) => [d.id, d]));
    const total = [...monthlyByDonor.values()].reduce((s, v) => s + v, 0);
    const rows = [...monthlyByDonor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([donorId, value]) => {
        const donor = donorMap.get(donorId);
        return {
          donorId,
          name: donor?.anonymousPreference
            ? "Anonymous Donor"
            : formatPersonName(donor?.name),
          isAnonymous: Boolean(donor?.anonymousPreference),
          metricValueCents: Math.round(value),
          donationCount: 0,
          lastDonationAt: null,
          isRecurring: true,
          isAtRisk: false,
          shareOfTotal: total > 0 ? value / total : 0,
        };
      });
    return { rows, totalForMetricCents: Math.round(total) };
  }

  const transfers = instrumentIds.length
    ? await prisma.finixTransfer.findMany({
        where: {
          churchId,
          finixPaymentInstrumentId: { in: instrumentIds },
          state: "SUCCEEDED",
          ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
        },
        select: {
          finixTransferId: true,
          finixPaymentInstrumentId: true,
          amountCents: true,
          createdAtFinix: true,
        },
      })
    : [];
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [refunds, bankReturns, activeSubInstruments, externalDonations] =
    await Promise.all([
      metric === "net" && transferIds.length
        ? prisma.finixRefundOrReversal.findMany({
            where: {
              churchId,
              finixOriginalTransferId: { in: transferIds },
              state: "SUCCEEDED",
            },
            select: { finixOriginalTransferId: true, amountCents: true },
          })
        : Promise.resolve([]),
      metric === "net" && transferIds.length
        ? prisma.bankReturn.findMany({
            where: { churchId, originalTransferId: { in: transferIds } },
            select: { originalTransferId: true, amountCents: true },
          })
        : Promise.resolve([]),
      instrumentIds.length
        ? prisma.finixSubscription.findMany({
            where: {
              churchId,
              finixPaymentInstrumentId: { in: instrumentIds },
              state: "ACTIVE",
            },
            select: { finixPaymentInstrumentId: true },
          })
        : Promise.resolve([]),
      prisma.externalDonation
        .findMany({
          where: externalDonationEligibilityWhere(churchId, {
            donorIds: donorIdIn,
            dateFilter,
          }),
          select: {
            donorId: true,
            donationAmountCents: true,
            donationDate: true,
            depositStatus: true,
          },
        })
        .then((rows) => rows.filter(isExternalDonationDeposited)),
    ]);

  const transferIdToDonor = new Map<string, string>();
  for (const t of transfers) {
    const donorId = t.finixPaymentInstrumentId
      ? instrumentToDonor.get(t.finixPaymentInstrumentId)
      : undefined;
    if (donorId) transferIdToDonor.set(t.finixTransferId, donorId);
  }
  const recurringDonorIds = new Set(
    activeSubInstruments
      .map((s) =>
        s.finixPaymentInstrumentId
          ? instrumentToDonor.get(s.finixPaymentInstrumentId)
          : undefined,
      )
      .filter(Boolean),
  );

  interface Acc {
    grossCents: number;
    refundedCents: number;
    returnedCents: number;
    count: number;
    lastDonationAt: Date | null;
  }
  const byDonor = new Map<string, Acc>();
  for (const t of transfers) {
    const donorId = t.finixPaymentInstrumentId
      ? instrumentToDonor.get(t.finixPaymentInstrumentId)
      : undefined;
    if (!donorId) continue;
    const acc = byDonor.get(donorId) ?? {
      grossCents: 0,
      refundedCents: 0,
      returnedCents: 0,
      count: 0,
      lastDonationAt: null,
    };
    acc.grossCents += t.amountCents ?? 0;
    acc.count += 1;
    if (
      t.createdAtFinix &&
      (!acc.lastDonationAt || t.createdAtFinix > acc.lastDonationAt)
    )
      acc.lastDonationAt = t.createdAtFinix;
    byDonor.set(donorId, acc);
  }
  // External donations are grouped into the same accumulator, keyed by the
  // same canonical Donor.id — a donor with both a Finix transfer and a cash
  // gift ends up as one Map entry, not two, which is what makes Top Donors
  // reflect the unified identity rather than double-counting or picking
  // only one source.
  for (const d of externalDonations) {
    if (!d.donorId) continue;
    const acc = byDonor.get(d.donorId) ?? {
      grossCents: 0,
      refundedCents: 0,
      returnedCents: 0,
      count: 0,
      lastDonationAt: null,
    };
    acc.grossCents += d.donationAmountCents;
    acc.count += 1;
    if (!acc.lastDonationAt || d.donationDate > acc.lastDonationAt)
      acc.lastDonationAt = d.donationDate;
    byDonor.set(d.donorId, acc);
  }
  for (const r of refunds) {
    const donorId = r.finixOriginalTransferId
      ? transferIdToDonor.get(r.finixOriginalTransferId)
      : undefined;
    if (!donorId) continue;
    const acc = byDonor.get(donorId);
    if (acc) acc.refundedCents += r.amountCents ?? 0;
  }
  for (const r of bankReturns) {
    const donorId = r.originalTransferId
      ? transferIdToDonor.get(r.originalTransferId)
      : undefined;
    if (!donorId) continue;
    const acc = byDonor.get(donorId);
    if (acc) acc.returnedCents += r.amountCents ?? 0;
  }

  const metricValue = (acc: Acc) => {
    if (metric === "gross") return acc.grossCents;
    if (metric === "count") return acc.count;
    return acc.grossCents - acc.refundedCents - acc.returnedCents; // net
  };

  const total = [...byDonor.values()].reduce(
    (s, acc) => s + metricValue(acc),
    0,
  );

  const sortedEntries = [...byDonor.entries()].sort((a, b) => {
    const diff = metricValue(b[1]) - metricValue(a[1]);
    if (diff !== 0) return diff;
    const aLast = a[1].lastDonationAt?.getTime() ?? 0;
    const bLast = b[1].lastDonationAt?.getTime() ?? 0;
    if (bLast !== aLast) return bLast - aLast;
    return a[0].localeCompare(b[0]);
  });

  const topEntries = sortedEntries.slice(0, limit);
  const donors = await prisma.donor.findMany({
    where: { id: { in: topEntries.map(([id]) => id) }, churchId },
  });
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  const rows: TopDonorRow[] = topEntries.map(([donorId, acc]) => {
    const donor = donorMap.get(donorId);
    return {
      donorId,
      name: donor?.anonymousPreference
        ? "Anonymous Donor"
        : formatPersonName(donor?.name),
      isAnonymous: Boolean(donor?.anonymousPreference),
      metricValueCents: metricValue(acc),
      donationCount: acc.count,
      lastDonationAt: acc.lastDonationAt,
      isRecurring: recurringDonorIds.has(donorId),
      isAtRisk: false,
      shareOfTotal: total > 0 ? metricValue(acc) / total : 0,
    };
  });

  return { rows, totalForMetricCents: total };
}

function normalizeToMonthly(
  amountCents: number,
  billingInterval: string | null,
): number {
  switch ((billingInterval || "").toUpperCase()) {
    case "WEEKLY":
      return (amountCents * 52) / 12;
    case "BIWEEKLY":
    case "EVERY_TWO_WEEKS":
      return (amountCents * 26) / 12;
    case "MONTHLY":
      return amountCents;
    case "QUARTERLY":
      return amountCents / 3;
    case "YEARLY":
    case "ANNUALLY":
      return amountCents / 12;
    default:
      return amountCents;
  }
}
