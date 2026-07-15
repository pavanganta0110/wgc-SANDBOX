import { prisma } from "@/lib/prisma";
import { loadDonorAggregates } from "@/lib/donors/donorAggregates";
import { loadDonorRiskSignals } from "@/lib/donors/donorRiskSignals";
import { resolveDonorDisplayStatus, resolveDonorNeedsAttentionReasons } from "@/lib/donors/donorStatus";

/**
 * Shared data loader for a single donor's detail view — used by both the
 * right-side drawer and the full profile page, mirroring
 * loadDisputeDetail/loadSettlementDetail so the two never drift and every
 * join happens once per request.
 */
export async function loadDonorDetail(donorId: string, churchId: string) {
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId } });
  if (!donor) return null;

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId },
    orderBy: { updatedAtFinix: "desc" },
  });
  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);

  const [aggregates, riskInput, recentTransfers, activeSubscriptions, notes] = await Promise.all([
    loadDonorAggregates(donorId, churchId),
    loadDonorRiskSignals([donorId], churchId).then((m) => m.get(donorId)!),
    instrumentIds.length
      ? prisma.finixTransfer.findMany({
          where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
          orderBy: { createdAtFinix: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    instrumentIds.length
      ? prisma.finixSubscription.findMany({
          where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "ACTIVE" },
          orderBy: { createdAtFinix: "desc" },
        })
      : Promise.resolve([]),
    prisma.donorNote.findMany({
      where: { donorId, churchId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const status = resolveDonorDisplayStatus(riskInput);
  const needsAttentionReasons = resolveDonorNeedsAttentionReasons(riskInput);

  return { donor, instruments, aggregates, status, needsAttentionReasons, recentTransfers, activeSubscriptions, notes };
}

type DonorDetail = NonNullable<Awaited<ReturnType<typeof loadDonorDetail>>>;
