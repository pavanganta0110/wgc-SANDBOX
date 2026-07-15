import { prisma } from "@/lib/prisma";
import {
  DONOR_ACTIVITY_WINDOW_DAYS,
  DONOR_REPEATED_FAILURE_WINDOW_DAYS,
  DONOR_REPEATED_FAILURE_THRESHOLD,
  type DonorStatusInput,
} from "@/lib/donors/donorStatus";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Batch-loads the real signals resolveDonorDisplayStatus() needs, for a set
 * of donors in one organization. One findMany per table (never per donor),
 * matching the same batch-join discipline as loadDonorAggregatesBatch.
 *
 * Base donation/failure record is FinixTransfer (donor resolved via
 * finixPaymentInstrumentId), not Payment — see donorAggregates.ts for why:
 * Payment is nearly empty for organizations whose donations were synced
 * directly from the processor rather than created through WGC's own
 * checkout flow.
 */
export async function loadDonorRiskSignals(
  donorIds: string[],
  churchId: string,
): Promise<Map<string, DonorStatusInput>> {
  const result = new Map<string, DonorStatusInput>(
    donorIds.map((id) => [
      id,
      {
        archivedAt: null,
        hasActiveSubscription: false,
        hasPastDueSubscription: false,
        hasRecentBankReturn: false,
        hasOpenDispute: false,
        hasRecentRepeatedFailures: false,
        hasDisabledPaymentMethodOnActiveSubscription: false,
        hasRecentSuccessfulDonation: false,
      },
    ]),
  );
  if (donorIds.length === 0) return result;

  const activityCutoff = daysAgo(DONOR_ACTIVITY_WINDOW_DAYS);
  const failureCutoff = daysAgo(DONOR_REPEATED_FAILURE_WINDOW_DAYS);

  const donors = await prisma.donor.findMany({
    where: { id: { in: donorIds }, churchId },
    select: { id: true, archivedAt: true },
  });
  for (const d of donors) {
    const entry = result.get(d.id);
    if (entry) entry.archivedAt = d.archivedAt;
  }

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { finixPaymentInstrumentId: true, donorId: true, enabled: true, state: true },
  });
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]));
  const disabledInstrumentIds = new Set(
    instruments.filter((i) => i.enabled === false || i.state === "DISABLED" || i.state === "EXPIRED").map((i) => i.finixPaymentInstrumentId),
  );
  const instrumentIds = [...instrumentToDonor.keys()];

  if (instrumentIds.length === 0) return result;

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
    select: { finixTransferId: true, finixPaymentInstrumentId: true, state: true, createdAtFinix: true },
  });

  const transferIdToDonor = new Map<string, string>();
  const failuresByDonor = new Map<string, number>();
  const recentSuccessDonors = new Set<string>();
  for (const t of transfers) {
    const donorId = t.finixPaymentInstrumentId ? instrumentToDonor.get(t.finixPaymentInstrumentId) : undefined;
    if (!donorId) continue;
    transferIdToDonor.set(t.finixTransferId, donorId);

    const state = (t.state || "").toUpperCase();
    const occurredAt = t.createdAtFinix;
    if (state === "FAILED" && occurredAt && occurredAt >= failureCutoff) {
      failuresByDonor.set(donorId, (failuresByDonor.get(donorId) ?? 0) + 1);
    }
    if (state === "SUCCEEDED" && occurredAt && occurredAt >= activityCutoff) {
      recentSuccessDonors.add(donorId);
    }
  }
  const transferIds = [...transferIdToDonor.keys()];

  const [bankReturns, openDisputes] = await Promise.all([
    transferIds.length
      ? prisma.bankReturn.findMany({
          where: { churchId, originalTransferId: { in: transferIds }, createdAtFinix: { gte: activityCutoff } },
          select: { originalTransferId: true },
        })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.finixDispute.findMany({
          where: { churchId, finixTransferId: { in: transferIds }, resolvedAt: null },
          select: { finixTransferId: true },
        })
      : Promise.resolve([]),
  ]);

  for (const r of bankReturns) {
    const donorId = r.originalTransferId ? transferIdToDonor.get(r.originalTransferId) : undefined;
    if (donorId) {
      const entry = result.get(donorId);
      if (entry) entry.hasRecentBankReturn = true;
    }
  }
  for (const d of openDisputes) {
    const donorId = d.finixTransferId ? transferIdToDonor.get(d.finixTransferId) : undefined;
    if (donorId) {
      const entry = result.get(donorId);
      if (entry) entry.hasOpenDispute = true;
    }
  }
  for (const [donorId, count] of failuresByDonor) {
    if (count >= DONOR_REPEATED_FAILURE_THRESHOLD) {
      const entry = result.get(donorId);
      if (entry) entry.hasRecentRepeatedFailures = true;
    }
  }
  for (const donorId of recentSuccessDonors) {
    const entry = result.get(donorId);
    if (entry) entry.hasRecentSuccessfulDonation = true;
  }

  const subs = await prisma.finixSubscription.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
    select: { finixPaymentInstrumentId: true, state: true },
  });

  for (const s of subs) {
    const donorId = s.finixPaymentInstrumentId ? instrumentToDonor.get(s.finixPaymentInstrumentId) : undefined;
    if (!donorId) continue;
    const entry = result.get(donorId);
    if (!entry) continue;
    const state = (s.state || "").toUpperCase();
    if (state === "ACTIVE") {
      entry.hasActiveSubscription = true;
      if (s.finixPaymentInstrumentId && disabledInstrumentIds.has(s.finixPaymentInstrumentId)) {
        entry.hasDisabledPaymentMethodOnActiveSubscription = true;
      }
    }
    if (state.includes("PAST_DUE")) entry.hasPastDueSubscription = true;
  }

  return result;
}
