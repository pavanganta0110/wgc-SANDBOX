import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/formatPersonName";
import {
  resolveSubscriptionDisplayStatus,
  resolveRecurringDonorStatus,
  normalizeToMonthlyValueCents,
  annualizedValueCents,
  type SubscriptionDisplayStatus,
} from "@/lib/subscriptions/subscriptionStatus";
import { reconcileStaleActiveSubscriptions } from "@/lib/subscriptions/subscriptionReconciliation";

/**
 * Same bounded-candidate-then-aggregate-in-memory tradeoff as
 * DONOR_CANDIDATE_CAP in donorsList.ts: base filters run in SQL, then
 * financial/attribution aggregates (which can't be expressed as a single
 * SQL WHERE since nothing is cached) are computed in one batch of queries
 * for this bounded set, all within a single server request — not a
 * client-side full-history load, not silently unbounded either.
 */
export const SUBSCRIPTION_CANDIDATE_CAP = 2000;

export interface PaymentMethodSummary {
  type: string | null;
  brand: string | null;
  last4: string | null;
  state: string | null;
  expirationMonth: number | null;
  expirationYear: number | null;
  accountHolderName: string | null;
}

export interface SubscriptionRow {
  id: string;
  finixSubscriptionId: string;
  churchId: string;
  donorId: string | null;
  donorName: string;
  donorEmail: string | null;
  donorPhone: string | null;
  // True when donorId could not be resolved (directly or via the linked
  // instrument) and an authorized admin needs to pick the correct donor —
  // never auto-matched by name alone. See subscriptionReconciliation.ts.
  needsDonorMatching: boolean;
  amountCents: number;
  currency: string;
  billingInterval: string | null;
  monthlyValueCents: number;
  displayStatus: SubscriptionDisplayStatus;
  startDate: Date | null;
  nextBillingDate: Date | null;
  endDate: Date | null;
  canceledAt: Date | null;
  completedAt: Date | null;
  lastPayment: { date: Date; amountCents: number; state: string } | null;
  lastFailure: { date: Date; message: string | null } | null;
  paymentMethod: PaymentMethodSummary | null;
  givingLinkId: string | null;
  givingLinkName: string | null;
  fundId: string | null;
  fundName: string | null;
  failedAttempts: number;
  lifetimeCollectedCents: number;
  requiresAttention: boolean;
  attentionReasons: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface TransferStats {
  lifetimeCollectedCents: number;
  failedAttempts: number;
  lastPayment: { date: Date; amountCents: number; state: string } | null;
  lastFailure: { date: Date; message: string | null } | null;
}

/** Batch-loads per-subscription payment stats from exactly-attributed transfers only (finixSubscriptionId set) — one query, no N+1. Transfers whose subscription link is unverified are never included here (see subscriptionAttribution.ts). */
async function loadTransferStatsBatch(finixSubscriptionIds: string[], churchId: string): Promise<Map<string, TransferStats>> {
  const map = new Map<string, TransferStats>();
  if (finixSubscriptionIds.length === 0) return map;

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixSubscriptionId: { in: finixSubscriptionIds } },
    select: { finixSubscriptionId: true, state: true, amountCents: true, createdAtFinix: true, failureMessage: true },
    orderBy: { createdAtFinix: "desc" },
  });

  for (const t of transfers) {
    const subId = t.finixSubscriptionId!;
    if (!map.has(subId)) {
      map.set(subId, { lifetimeCollectedCents: 0, failedAttempts: 0, lastPayment: null, lastFailure: null });
    }
    const stats = map.get(subId)!;
    const state = (t.state || "").toUpperCase();
    if (state === "SUCCEEDED") {
      stats.lifetimeCollectedCents += t.amountCents ?? 0;
      if (!stats.lastPayment && t.createdAtFinix) {
        stats.lastPayment = { date: t.createdAtFinix, amountCents: t.amountCents ?? 0, state };
      }
    }
    if (state === "FAILED") {
      stats.failedAttempts += 1;
      if (!stats.lastFailure && t.createdAtFinix) {
        stats.lastFailure = { date: t.createdAtFinix, message: t.failureMessage };
      }
    }
  }
  return map;
}

export interface SubscriptionCandidateFilters {
  donorId?: string;
  id?: string;
  status?: SubscriptionDisplayStatus | "MIXED";
}

/** Fetches a bounded set of subscriptions + their instrument/donor/givingLink/fund joins in a fixed number of batch queries, then shapes each into a fully-attributed SubscriptionRow. This is the single shared source both the Subscriptions (schedule-centric) and Recurring Donors (donor-centric, grouped by donorId) list loaders build on. */
export async function loadSubscriptionCandidates(churchId: string, filters: SubscriptionCandidateFilters = {}): Promise<SubscriptionRow[]> {
  // Self-healing fallback for missed/delayed subscription.updated webhooks —
  // bounded and throttled (see subscriptionReconciliation.ts), so opening
  // either the Subscriptions or Recurring Donors page never permanently
  // shows a stale nextBillingDate/state/donor linkage.
  try {
    await reconcileStaleActiveSubscriptions(churchId);
  } catch (err) {
    console.error("Stale-subscription reconciliation pass failed:", err);
  }

  const subscriptions = await prisma.finixSubscription.findMany({
    where: {
      churchId,
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.id ? { id: filters.id } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: SUBSCRIPTION_CANDIDATE_CAP,
  });
  if (subscriptions.length === 0) return [];

  const donorIds = [...new Set(subscriptions.map((s) => s.donorId).filter((x): x is string => !!x))];
  const instrumentIds = [...new Set(subscriptions.map((s) => s.finixPaymentInstrumentId).filter((x): x is string => !!x))];
  const givingLinkIds = [...new Set(subscriptions.map((s) => s.givingLinkId).filter((x): x is string => !!x))];
  const finixSubscriptionIds = subscriptions.map((s) => s.finixSubscriptionId);

  const [donors, instruments, givingLinks, transferStats, funds] = await Promise.all([
    donorIds.length ? prisma.donor.findMany({ where: { id: { in: donorIds } } }) : Promise.resolve([]),
    instrumentIds.length ? prisma.finixPaymentInstrumentSnapshot.findMany({ where: { finixPaymentInstrumentId: { in: instrumentIds } } }) : Promise.resolve([]),
    givingLinkIds.length ? prisma.givingLink.findMany({ where: { id: { in: givingLinkIds } }, select: { id: true, internalName: true, fundId: true, fundName: true } }) : Promise.resolve([]),
    loadTransferStatsBatch(finixSubscriptionIds, churchId),
    prisma.fund.findMany({ where: { churchId }, select: { id: true, name: true } }),
  ]);

  const donorById = new Map(donors.map((d) => [d.id, d]));
  const instrumentById = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));
  const givingLinkById = new Map(givingLinks.map((g) => [g.id, g]));
  const fundById = new Map(funds.map((f) => [f.id, f.name]));

  const rows: SubscriptionRow[] = subscriptions.map((s) => {
    const donor = s.donorId ? donorById.get(s.donorId) : null;
    const instrument = s.finixPaymentInstrumentId ? instrumentById.get(s.finixPaymentInstrumentId) : null;
    const givingLink = s.givingLinkId ? givingLinkById.get(s.givingLinkId) : null;
    const stats = transferStats.get(s.finixSubscriptionId) ?? { lifetimeCollectedCents: 0, failedAttempts: 0, lastPayment: null, lastFailure: null };
    const displayStatus = resolveSubscriptionDisplayStatus({ rawState: s.state, canceledAt: s.canceledAt, completedAt: s.completedAt });
    const monthlyValueCents = displayStatus === "ACTIVE" ? normalizeToMonthlyValueCents(s.amountCents ?? 0, s.billingInterval) : 0;

    const paymentMethodDisabled = instrument?.enabled === false;
    const paymentMethodExpired = Boolean(
      instrument?.cardExpirationYear &&
        instrument?.cardExpirationMonth &&
        new Date(instrument.cardExpirationYear, instrument.cardExpirationMonth, 1) < new Date(),
    );

    const attentionReasons: string[] = [];
    if (displayStatus === "PAST_DUE") attentionReasons.push("Past-due subscription");
    if (displayStatus === "FAILED") attentionReasons.push("Subscription failed");
    if (stats.failedAttempts > 0 && displayStatus === "ACTIVE") attentionReasons.push(`${stats.failedAttempts} failed recurring payment${stats.failedAttempts > 1 ? "s" : ""}`);
    if (displayStatus === "ACTIVE" && paymentMethodDisabled) attentionReasons.push("Disabled payment method");
    if (displayStatus === "ACTIVE" && paymentMethodExpired) attentionReasons.push("Expired payment method");
    if (displayStatus === "ACTIVE" && donor && !donor.email) attentionReasons.push("Missing donor email");
    if (displayStatus === "ACTIVE" && !donor && s.needsDonorMatching) attentionReasons.push("Needs donor matching");

    const fundId = s.fundId ?? givingLink?.fundId ?? null;

    return {
      id: s.id,
      finixSubscriptionId: s.finixSubscriptionId,
      churchId,
      donorId: s.donorId,
      donorName: donor
        ? donor.anonymousPreference
          ? "Anonymous Donor"
          : formatPersonName(donor.name)
        : s.needsDonorMatching
          ? "Needs Donor Matching"
          : "Unknown Donor",
      donorEmail: donor?.email ?? null,
      donorPhone: donor?.phone ?? null,
      needsDonorMatching: !donor && s.needsDonorMatching,
      amountCents: s.amountCents ?? 0,
      currency: s.currency ?? "USD",
      billingInterval: s.billingInterval,
      monthlyValueCents,
      displayStatus,
      startDate: s.startedAt,
      nextBillingDate: displayStatus === "ACTIVE" ? s.nextBillingDate : null,
      endDate: s.canceledAt ?? s.completedAt,
      canceledAt: s.canceledAt,
      completedAt: s.completedAt,
      lastPayment: stats.lastPayment,
      lastFailure: stats.lastFailure,
      paymentMethod: instrument
        ? {
            type: instrument.instrumentType,
            brand: instrument.cardBrand,
            last4: instrument.cardLast4 ?? instrument.bankLast4,
            state: instrument.state,
            expirationMonth: instrument.cardExpirationMonth,
            expirationYear: instrument.cardExpirationYear,
            accountHolderName: instrument.accountHolderName,
          }
        : null,
      givingLinkId: s.givingLinkId,
      givingLinkName: givingLink?.internalName ?? null,
      fundId,
      fundName: fundId ? fundById.get(fundId) ?? givingLink?.fundName ?? null : null,
      failedAttempts: stats.failedAttempts,
      lifetimeCollectedCents: stats.lifetimeCollectedCents,
      requiresAttention: attentionReasons.length > 0,
      attentionReasons,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  });

  return filters.status ? rows.filter((r) => (filters.status === "MIXED" ? false : r.displayStatus === filters.status)) : rows;
}

export interface RecurringDonorRow {
  donorId: string;
  donorName: string;
  donorEmail: string | null;
  donorPhone: string | null;
  overallStatus: SubscriptionDisplayStatus | "MIXED" | "NONE";
  monthlyValueCents: number;
  annualizedValueCents: number;
  activeSubscriptionCount: number;
  totalSubscriptionCount: number;
  pastDueSubscriptionCount: number;
  frequencies: string[];
  nextBillingDate: Date | null;
  lastSuccessfulPayment: { date: Date; amountCents: number } | null;
  primaryPaymentMethod: PaymentMethodSummary | null;
  failedPaymentCount: number;
  lastFailureDate: Date | null;
  lifetimeRecurringDonatedCents: number;
  givingLinkName: string | null;
  requiresAttention: boolean;
  attentionReasons: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Groups the same subscription candidates by donor so a donor with N subscriptions appears exactly once here (vs. N times on the Subscriptions list). */
export function groupSubscriptionsByDonor(subscriptions: SubscriptionRow[]): RecurringDonorRow[] {
  const byDonor = new Map<string, SubscriptionRow[]>();
  for (const s of subscriptions) {
    if (!s.donorId) continue; // a subscription with no resolvable donor can't anchor a Recurring Donor row
    if (!byDonor.has(s.donorId)) byDonor.set(s.donorId, []);
    byDonor.get(s.donorId)!.push(s);
  }

  const rows: RecurringDonorRow[] = [];
  for (const [donorId, subs] of byDonor) {
    const active = subs.filter((s) => s.displayStatus === "ACTIVE");
    const pastDue = subs.filter((s) => s.displayStatus === "PAST_DUE");
    const monthlyValueCents = active.reduce((sum, s) => sum + s.monthlyValueCents, 0);

    const nextBillingCandidates = active.map((s) => s.nextBillingDate).filter((d): d is Date => !!d);
    const nextBillingDate = nextBillingCandidates.length ? new Date(Math.min(...nextBillingCandidates.map((d) => d.getTime()))) : null;

    const successfulPayments = subs.map((s) => s.lastPayment).filter((p): p is { date: Date; amountCents: number; state: string } => !!p);
    const lastSuccessfulPayment = successfulPayments.length
      ? successfulPayments.reduce((latest, p) => (p.date > latest.date ? p : latest))
      : null;

    const failures = subs.map((s) => s.lastFailure).filter((f): f is { date: Date; message: string | null } => !!f);
    const lastFailureDate = failures.length ? failures.reduce((latest, f) => (f.date > latest.date ? f : latest)).date : null;
    const failedPaymentCount = subs.reduce((sum, s) => sum + s.failedAttempts, 0);

    const primaryPaymentMethod = active[0]?.paymentMethod ?? subs[0]?.paymentMethod ?? null;
    const attentionSubs = subs.filter((s) => s.requiresAttention);
    const attentionReasons = [...new Set(attentionSubs.flatMap((s) => s.attentionReasons))];

    const first = subs[0];
    rows.push({
      donorId,
      donorName: first.donorName,
      donorEmail: first.donorEmail,
      donorPhone: first.donorPhone,
      overallStatus: resolveRecurringDonorStatus(subs.map((s) => s.displayStatus)),
      monthlyValueCents,
      annualizedValueCents: annualizedValueCents(monthlyValueCents),
      activeSubscriptionCount: active.length,
      totalSubscriptionCount: subs.length,
      pastDueSubscriptionCount: pastDue.length,
      frequencies: [...new Set(active.map((s) => s.billingInterval).filter((x): x is string => !!x))],
      nextBillingDate,
      lastSuccessfulPayment: lastSuccessfulPayment ? { date: lastSuccessfulPayment.date, amountCents: lastSuccessfulPayment.amountCents } : null,
      primaryPaymentMethod,
      failedPaymentCount,
      lastFailureDate,
      lifetimeRecurringDonatedCents: subs.reduce((sum, s) => sum + s.lifetimeCollectedCents, 0),
      givingLinkName: active[0]?.givingLinkName ?? subs[0]?.givingLinkName ?? null,
      requiresAttention: attentionReasons.length > 0,
      attentionReasons,
      createdAt: subs.reduce((min, s) => (s.createdAt < min ? s.createdAt : min), first.createdAt),
      updatedAt: subs.reduce((max, s) => (s.updatedAt > max ? s.updatedAt : max), first.updatedAt),
    });
  }

  return rows;
}
