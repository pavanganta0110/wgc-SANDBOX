import { prisma } from "@/lib/prisma";
import { loadDonorAggregates } from "@/lib/donors/donorAggregates";
import { loadDonorRiskSignals } from "@/lib/donors/donorRiskSignals";
import { resolveDonorDisplayStatus, resolveDonorNeedsAttentionReasons } from "@/lib/donors/donorStatus";

/**
 * Shared data loader for a single donor's detail view — used by both the
 * right-side drawer and the full profile page, mirroring
 * loadDisputeDetail/loadSettlementDetail so the two never drift and every
 * join happens once per request.
 *
 * Team-access Checkpoint 4B: `attributedUserId`, when passed, scopes every
 * giving-history field below to only that user's attributed activity —
 * fixing the gap where a FUNDRAISER could open a qualifying donor (one with
 * at least one payment/subscription attributed to them) but then see the
 * donor's FULL organization-wide history, including other team members'
 * donations. Undefined/omitted = organization scope (owner/admin), unchanged
 * from before. Risk signals (fraud/at-risk flags) are intentionally left
 * unscoped — they're an organization-level trust assessment of the donor,
 * not part of "this user's giving relationship" the way payments/
 * subscriptions/notes are.
 */
export async function loadDonorDetail(donorId: string, churchId: string, attributedUserId?: string) {
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId } });
  if (!donor) return null;

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId },
    orderBy: { updatedAtFinix: "desc" },
  });
  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);

  // FinixTransfer carries no attribution of its own — bridge through
  // Payment.attributedUserId, same pattern as buildFinixTransferScope.
  const allowedTransferIds = attributedUserId
    ? new Set(
        (
          await prisma.payment.findMany({
            where: { churchId, attributedUserId },
            select: { finixTransferId: true },
          })
        )
          .map((p) => p.finixTransferId)
          .filter((id): id is string => Boolean(id))
      )
    : null;

  const [aggregates, riskInput, recentTransfersRaw, activeSubscriptions, notes] = await Promise.all([
    loadDonorAggregates(donorId, churchId, undefined, attributedUserId),
    loadDonorRiskSignals([donorId], churchId).then((m) => m.get(donorId)!),
    instrumentIds.length
      ? prisma.finixTransfer.findMany({
          where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
          orderBy: { createdAtFinix: "desc" },
          // Over-fetch when scoped, since the in-memory filter below may
          // drop rows — still bounded, not unbounded.
          take: attributedUserId ? 25 : 5,
        })
      : Promise.resolve([]),
    instrumentIds.length
      ? prisma.finixSubscription.findMany({
          where: {
            churchId,
            finixPaymentInstrumentId: { in: instrumentIds },
            state: "ACTIVE",
            ...(attributedUserId ? { attributedUserId } : {}),
          },
          orderBy: { createdAtFinix: "desc" },
        })
      : Promise.resolve([]),
    // Notes are organization-internal staff annotations, not part of any
    // one user's giving relationship with the donor — hidden entirely for
    // a user-scoped view rather than partially exposed.
    attributedUserId
      ? Promise.resolve([])
      : prisma.donorNote.findMany({
          where: { donorId, churchId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
  ]);

  const recentTransfers = allowedTransferIds
    ? recentTransfersRaw.filter((t) => allowedTransferIds.has(t.finixTransferId)).slice(0, 5)
    : recentTransfersRaw;

  const status = resolveDonorDisplayStatus(riskInput);
  const needsAttentionReasons = resolveDonorNeedsAttentionReasons(riskInput);

  return { donor, instruments, aggregates, status, needsAttentionReasons, recentTransfers, activeSubscriptions, notes };
}

type DonorDetail = NonNullable<Awaited<ReturnType<typeof loadDonorDetail>>>;
