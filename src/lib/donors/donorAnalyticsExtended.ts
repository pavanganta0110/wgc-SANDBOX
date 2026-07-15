import { prisma } from "@/lib/prisma";
import { loadDonorAggregatesBatch, type DateRangeFilter } from "@/lib/donors/donorAggregates";
import { loadDonorRiskSignals } from "@/lib/donors/donorRiskSignals";
import { resolveDonorDisplayStatus, resolveDonorNeedsAttentionReasons, type DonorDisplayStatus } from "@/lib/donors/donorStatus";
import { DONOR_CANDIDATE_CAP } from "@/lib/donors/donorsList";
import { formatPersonName } from "@/lib/formatPersonName";
import { startOfDayCentral } from "@/lib/formatDateTimeCDT";

const CENTRAL_TIME_ZONE = "America/Chicago";

export interface NewVsReturning {
  newCount: number;
  returningCount: number;
  newAmountCents: number;
  returningAmountCents: number;
}

export interface OneTimeVsRecurring {
  oneTimeAmountCents: number;
  oneTimeCount: number;
  recurringAmountCents: number;
  recurringCount: number;
  uniqueOneTimeDonors: number;
  uniqueRecurringDonors: number;
}

export interface RetentionMetrics {
  returningDonorRate: number | null;
  repeatDonationRate: number | null;
  recurringDonorRate: number | null;
  retainedDonors: number;
  lapsedDonors: number;
  insufficientData: boolean;
}

export interface ConcentrationMetrics {
  top1SharePct: number;
  top5SharePct: number;
  top10SharePct: number;
  remainingSharePct: number;
}

export interface AttentionRow {
  donorId: string;
  name: string;
  reasons: string[];
  amountAffectedCents: number;
  lastEventAt: Date | null;
}

export interface DonorAnalyticsExtended {
  newVsReturning: NewVsReturning;
  oneTimeVsRecurring: OneTimeVsRecurring;
  statusBreakdown: Record<DonorDisplayStatus, number>;
  retention: RetentionMetrics;
  concentration: ConcentrationMetrics;
  attentionList: AttentionRow[];
  candidateCapReached: boolean;
}

/**
 * Single consolidated pass over one bounded candidate set (same
 * DONOR_CANDIDATE_CAP tradeoff as donorSummary.ts) computing every
 * remaining analytics section from one batch of aggregate/risk-signal
 * loads, rather than N separate expensive queries per chart.
 *
 * One-Time vs Recurring approximation: FinixTransfer has no direct FK to
 * the subscription billing cycle that produced it (no charge-to-transfer
 * link exists for FinixSubscription the way SubscriptionCharge exists for
 * the unrelated ChurchSubscription model). A transfer is classified
 * "recurring" when its payment instrument has ANY FinixSubscription
 * attached — an honest approximation, not a stored ground truth, but the
 * closest signal actually available without a schema change.
 */
export async function loadDonorAnalyticsExtended(
  churchId: string,
  dateFilter: DateRangeFilter | undefined,
  previousPeriodFilter: DateRangeFilter | undefined,
): Promise<DonorAnalyticsExtended> {
  const candidates = await prisma.donor.findMany({
    where: { churchId, archivedAt: null },
    select: { id: true, name: true, anonymousPreference: true },
    take: DONOR_CANDIDATE_CAP,
  });
  const donorIds = candidates.map((d) => d.id);
  const donorMap = new Map(candidates.map((d) => [d.id, d]));

  const [lifetimeMap, periodMap, riskMap] = await Promise.all([
    loadDonorAggregatesBatch(donorIds, churchId),
    dateFilter ? loadDonorAggregatesBatch(donorIds, churchId, dateFilter) : Promise.resolve(null),
    loadDonorRiskSignals(donorIds, churchId),
  ]);

  // ---- New vs Returning ----
  let newCount = 0,
    returningCount = 0,
    newAmountCents = 0,
    returningAmountCents = 0;
  for (const donorId of donorIds) {
    const lifetime = lifetimeMap.get(donorId)!;
    const period = periodMap ? periodMap.get(donorId)! : lifetime;
    if (period.donationCount === 0) continue;
    const isNew = dateFilter
      ? lifetime.firstDonationAt != null && lifetime.firstDonationAt >= dateFilter.gte && (!dateFilter.lte || lifetime.firstDonationAt <= dateFilter.lte)
      : false;
    if (isNew) {
      newCount += 1;
      newAmountCents += period.totalDonatedCents;
    } else {
      returningCount += 1;
      returningAmountCents += period.totalDonatedCents;
    }
  }

  // ---- Status breakdown ----
  const statusBreakdown: Record<DonorDisplayStatus, number> = { ARCHIVED: 0, AT_RISK: 0, RECURRING: 0, ACTIVE: 0, INACTIVE: 0 };
  const attentionList: AttentionRow[] = [];
  for (const donorId of donorIds) {
    const riskInput = riskMap.get(donorId)!;
    const status = resolveDonorDisplayStatus(riskInput);
    statusBreakdown[status] += 1;

    const reasons = resolveDonorNeedsAttentionReasons(riskInput);
    if (reasons.length > 0) {
      const lifetime = lifetimeMap.get(donorId)!;
      const donor = donorMap.get(donorId)!;
      attentionList.push({
        donorId,
        name: donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name),
        reasons,
        amountAffectedCents: lifetime.failedPaymentCount > 0 ? lifetime.totalDonatedCents : lifetime.disputedAmountCents + lifetime.returnedAmountCents,
        lastEventAt: lifetime.lastDonationAt,
      });
    }
  }
  attentionList.sort((a, b) => (b.lastEventAt?.getTime() ?? 0) - (a.lastEventAt?.getTime() ?? 0));

  // ---- Retention ----
  const activeDonorCount = statusBreakdown.ACTIVE + statusBreakdown.RECURRING + statusBreakdown.AT_RISK;
  const donorsWithAnyDonation = donorIds.filter((id) => lifetimeMap.get(id)!.donationCount > 0);
  const donorsWithRepeatDonation = donorsWithAnyDonation.filter((id) => lifetimeMap.get(id)!.donationCount >= 2);
  const repeatDonationRate = donorsWithAnyDonation.length > 0 ? donorsWithRepeatDonation.length / donorsWithAnyDonation.length : null;
  const recurringDonorRate = activeDonorCount > 0 ? statusBreakdown.RECURRING / activeDonorCount : null;
  const returningDonorRate = newCount + returningCount > 0 ? returningCount / (newCount + returningCount) : null;

  let retainedDonors = 0;
  let lapsedDonors = 0;
  const insufficientData = !previousPeriodFilter;
  if (previousPeriodFilter) {
    const previousMap = await loadDonorAggregatesBatch(donorIds, churchId, previousPeriodFilter);
    for (const donorId of donorIds) {
      const gavePreviously = previousMap.get(donorId)!.donationCount > 0;
      const gavesThisPeriod = (periodMap ? periodMap.get(donorId)! : lifetimeMap.get(donorId)!).donationCount > 0;
      if (gavePreviously && gavesThisPeriod) retainedDonors += 1;
      if (gavePreviously && !gavesThisPeriod) lapsedDonors += 1;
    }
  }

  // ---- Concentration (Net Donated, period-scoped) ----
  const netValues = donorIds
    .map((id) => (periodMap ? periodMap.get(id)! : lifetimeMap.get(id)!).netDonatedCents)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  const totalNet = netValues.reduce((s, v) => s + v, 0);
  const shareOf = (n: number) => (totalNet > 0 ? (netValues.slice(0, n).reduce((s, v) => s + v, 0) / totalNet) * 100 : 0);
  const top1 = shareOf(1);
  const top5 = shareOf(5);
  const top10 = shareOf(10);

  // ---- One-Time vs Recurring (payment-level, org-wide) ----
  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]));

  const [transfers, subs] = await Promise.all([
    instrumentIds.length
      ? prisma.finixTransfer.findMany({
          where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "SUCCEEDED", ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
          select: { finixPaymentInstrumentId: true, amountCents: true, createdVia: true },
        })
      : Promise.resolve([]),
    instrumentIds.length
      ? prisma.finixSubscription.findMany({ where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } }, select: { finixPaymentInstrumentId: true } })
      : Promise.resolve([]),
  ]);
  const instrumentsWithSubscription = new Set(subs.map((s) => s.finixPaymentInstrumentId));

  let oneTimeAmountCents = 0,
    oneTimeCount = 0,
    recurringAmountCents = 0,
    recurringCount = 0;
  const oneTimeDonors = new Set<string>();
  const recurringDonors = new Set<string>();
  for (const t of transfers) {
    // Exact signal when available: Finix's own createdVia === "SUBSCRIPTION"
    // confirms this specific transfer was a subscription billing charge.
    // Only falls back to the instrument-has-a-subscription approximation
    // for older transfers synced before this field was captured.
    const isRecurring = t.createdVia ? t.createdVia === "SUBSCRIPTION" : t.finixPaymentInstrumentId ? instrumentsWithSubscription.has(t.finixPaymentInstrumentId) : false;
    const donorId = t.finixPaymentInstrumentId ? instrumentToDonor.get(t.finixPaymentInstrumentId) : undefined;
    if (isRecurring) {
      recurringAmountCents += t.amountCents ?? 0;
      recurringCount += 1;
      if (donorId) recurringDonors.add(donorId);
    } else {
      oneTimeAmountCents += t.amountCents ?? 0;
      oneTimeCount += 1;
      if (donorId) oneTimeDonors.add(donorId);
    }
  }

  return {
    newVsReturning: { newCount, returningCount, newAmountCents, returningAmountCents },
    oneTimeVsRecurring: {
      oneTimeAmountCents,
      oneTimeCount,
      recurringAmountCents,
      recurringCount,
      uniqueOneTimeDonors: oneTimeDonors.size,
      uniqueRecurringDonors: recurringDonors.size,
    },
    statusBreakdown,
    retention: {
      returningDonorRate,
      repeatDonationRate,
      recurringDonorRate,
      retainedDonors,
      lapsedDonors,
      insufficientData,
    },
    concentration: {
      top1SharePct: top1,
      top5SharePct: top5,
      top10SharePct: top10,
      remainingSharePct: Math.max(0, 100 - top10),
    },
    attentionList: attentionList.slice(0, 10),
    candidateCapReached: candidates.length === DONOR_CANDIDATE_CAP,
  };
}

export interface DonorGrowthPoint {
  period: string;
  newDonors: number;
  returningDonors: number;
  totalActiveDonors: number;
}

/**
 * Uses each donor's true first-ever successful donation date (across all
 * time, not just the selected window) to classify New vs Returning per
 * bucket — a donor whose first gift was years ago and gave again this
 * period is returning, never new, even though this is the only donation of
 * theirs inside the window. totalActiveDonors is the count of distinct
 * donors who gave in that specific bucket (not a running/cumulative total).
 */
export async function loadDonorGrowth(
  churchId: string,
  dateFilter: DateRangeFilter | undefined,
  granularity: "daily" | "weekly" | "monthly",
): Promise<DonorGrowthPoint[]> {
  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { not: null } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]));
  const instrumentIds = [...instrumentToDonor.keys()];
  if (instrumentIds.length === 0) return [];

  // All-time transfers (not date-filtered) — needed to compute each donor's
  // true first-ever donation date, independent of the selected window.
  const allTransfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "SUCCEEDED" },
    select: { finixPaymentInstrumentId: true, createdAtFinix: true },
  });

  const firstDonationByDonor = new Map<string, number>();
  for (const t of allTransfers) {
    const donorId = t.finixPaymentInstrumentId ? instrumentToDonor.get(t.finixPaymentInstrumentId) : undefined;
    if (!donorId || !t.createdAtFinix) continue;
    const ts = t.createdAtFinix.getTime();
    if (!firstDonationByDonor.has(donorId) || ts < firstDonationByDonor.get(donorId)!) {
      firstDonationByDonor.set(donorId, ts);
    }
  }

  const windowTransfers = dateFilter
    ? allTransfers.filter((t) => t.createdAtFinix && t.createdAtFinix >= dateFilter.gte && (!dateFilter.lte || t.createdAtFinix <= dateFilter.lte))
    : allTransfers;

  const bucketCount = granularity === "daily" ? 30 : granularity === "weekly" ? 12 : 12;
  const stepDays = granularity === "daily" ? 1 : granularity === "weekly" ? 7 : 30;
  const labelFormat: Intl.DateTimeFormatOptions =
    granularity === "monthly" ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" };

  const now = dateFilter?.lte ?? new Date();
  const points: DonorGrowthPoint[] = [];

  for (let i = bucketCount - 1; i >= 0; i--) {
    const dayOffset = new Date(now);
    dayOffset.setDate(now.getDate() - i * stepDays);
    const periodStart = startOfDayCentral(dayOffset);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + stepDays);

    if (dateFilter?.gte && periodEnd < dateFilter.gte) continue;

    const donorsInBucket = new Set<string>();
    for (const t of windowTransfers) {
      if (!t.createdAtFinix || t.createdAtFinix < periodStart || t.createdAtFinix >= periodEnd) continue;
      const donorId = t.finixPaymentInstrumentId ? instrumentToDonor.get(t.finixPaymentInstrumentId) : undefined;
      if (donorId) donorsInBucket.add(donorId);
    }

    let newDonors = 0;
    let returningDonors = 0;
    for (const donorId of donorsInBucket) {
      const firstTs = firstDonationByDonor.get(donorId);
      if (firstTs != null && firstTs >= periodStart.getTime() && firstTs < periodEnd.getTime()) newDonors += 1;
      else returningDonors += 1;
    }

    points.push({
      period: periodStart.toLocaleDateString("en-US", { ...labelFormat, timeZone: CENTRAL_TIME_ZONE }),
      newDonors,
      returningDonors,
      totalActiveDonors: donorsInBucket.size,
    });
  }

  return points;
}
