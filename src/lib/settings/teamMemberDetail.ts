import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/formatPersonName";
import { loadSubscriptionCandidates } from "@/lib/subscriptions/subscriptionAggregates";

export interface TeamMemberSummary {
  userId: string;
  email: string;
  role: string;
  disabled: boolean;
  lastLoginAt: Date | null;
  grossRaisedCents: number;
  netRaisedCents: number;
  refundAmountCents: number;
  transactionCount: number;
  activeGivingLinkCount: number;
  recurringDonorCount: number;
  averageDonationCents: number;
  lastDonationAt: Date | null;
}

/**
 * Single-user version of the aggregation in
 * src/app/api/merchant/settings/team/metrics/route.ts — same attribution
 * fields (Payment.attributedUserId, GivingLink.ownerUserId,
 * FinixSubscription.attributedUserId) and the same "SUCCEEDED" gross
 * convention, just scoped to one member instead of batched across all of
 * them. Kept as a small, separate query set (not a loop over the org-wide
 * loader) so the detail page issues a handful of queries total, not one
 * per KPI. Disabled users are intentionally not filtered out anywhere here
 * — their historical attribution stays visible.
 */
export async function loadTeamMemberSummary(churchId: string, userId: string): Promise<TeamMemberSummary | null> {
  const member = await prisma.user.findFirst({
    where: { id: userId, churchId },
    select: { id: true, email: true, role: true, disabledAt: true, lastLoginAt: true },
  });
  if (!member) return null;

  const [activeGivingLinkCount, payments] = await Promise.all([
    prisma.givingLink.count({ where: { churchId, ownerUserId: userId, status: "ACTIVE" } }),
    prisma.payment.findMany({
      where: { churchId, attributedUserId: userId },
      select: { finixTransferId: true, amountCents: true, status: true, createdAt: true },
    }),
  ]);

  let grossRaisedCents = 0;
  let lastDonationAt: Date | null = null;
  const succeededTransferIds: string[] = [];
  const transactionCount = payments.length;
  for (const p of payments) {
    if (!lastDonationAt || p.createdAt > lastDonationAt) lastDonationAt = p.createdAt;
    if ((p.status || "").toUpperCase() === "SUCCEEDED") {
      grossRaisedCents += p.amountCents || 0;
      if (p.finixTransferId) succeededTransferIds.push(p.finixTransferId);
    }
  }

  const refunds = succeededTransferIds.length
    ? await prisma.finixRefundOrReversal.findMany({
        where: { churchId, finixOriginalTransferId: { in: succeededTransferIds }, state: "SUCCEEDED" },
        select: { amountCents: true },
      })
    : [];
  const refundAmountCents = refunds.reduce((sum, r) => sum + (r.amountCents || 0), 0);

  const subscriptions = await prisma.finixSubscription.findMany({
    where: { churchId, attributedUserId: userId, donorId: { not: null } },
    select: { donorId: true, state: true },
  });
  const recurringDonorCount = new Set(subscriptions.filter((s) => s.state === "ACTIVE").map((s) => s.donorId)).size;

  const succeededCount = succeededTransferIds.length;

  return {
    userId: member.id,
    email: member.email,
    role: member.role,
    disabled: !!member.disabledAt,
    lastLoginAt: member.lastLoginAt,
    grossRaisedCents,
    netRaisedCents: grossRaisedCents - refundAmountCents,
    refundAmountCents,
    transactionCount,
    activeGivingLinkCount,
    recurringDonorCount,
    averageDonationCents: succeededCount > 0 ? Math.round(grossRaisedCents / succeededCount) : 0,
    lastDonationAt,
  };
}

export interface TeamMemberGivingLinkRow {
  id: string;
  internalName: string;
  publicTitle: string;
  status: string;
  successfulDonations: number;
  totalCollectedCents: number;
  refundedCents: number;
  lastUsedAt: Date | null;
}

/** Uses GivingLink's own denormalized counters — never re-aggregated from
 * Payment, matching how the Giving Links list page already reads them. */
export async function loadTeamMemberGivingLinks(churchId: string, userId: string): Promise<TeamMemberGivingLinkRow[]> {
  return prisma.givingLink.findMany({
    where: { churchId, ownerUserId: userId },
    select: {
      id: true,
      internalName: true,
      publicTitle: true,
      status: true,
      successfulDonations: true,
      totalCollectedCents: true,
      refundedCents: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export interface TeamMemberTransactionRow {
  paymentId: string;
  finixTransferId: string | null;
  createdAt: Date;
  donorName: string;
  givingLinkName: string | null;
  paymentMethodType: string;
  amountCents: number;
  feeCents: number;
  refundedCents: number;
  netCents: number;
  status: string;
  settlementId: string | null;
  settlementState: string | null;
  settledAt: Date | null;
}

/** Payment.attributedUserId = userId is the only filter — the same
 * attribution field every other scoped surface in this app bridges
 * through. Refund lookups join by finixTransferId, same pattern as
 * loadTeamMemberSummary above. Fee and settlement come from FinixTransfer
 * (feeCents, finixSettlementId) — the same authoritative processing-fee
 * field the Payment Detail panel reads (see PaymentDetailPanel.tsx's Fee
 * Section: transfer.feeCents, not a Payment-model field), then
 * FinixSettlement for the batch that transfer was actually deposited in. */
export async function loadTeamMemberTransactions(churchId: string, userId: string): Promise<TeamMemberTransactionRow[]> {
  const payments = await prisma.payment.findMany({
    where: { churchId, attributedUserId: userId },
    select: {
      id: true,
      finixTransferId: true,
      donorId: true,
      givingLinkId: true,
      paymentMethodType: true,
      amountCents: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const donorIds = payments.map((p) => p.donorId).filter((id): id is string => Boolean(id));
  const givingLinkIds = payments.map((p) => p.givingLinkId).filter((id): id is string => Boolean(id));
  const transferIds = payments.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id));

  const [donors, givingLinks, refunds, transfers] = await Promise.all([
    donorIds.length ? prisma.donor.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    givingLinkIds.length
      ? prisma.givingLink.findMany({ where: { id: { in: givingLinkIds } }, select: { id: true, internalName: true } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({
          where: { churchId, finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" },
          select: { finixOriginalTransferId: true, amountCents: true },
        })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.finixTransfer.findMany({
          where: { churchId, finixTransferId: { in: transferIds } },
          select: { finixTransferId: true, feeCents: true, finixSettlementId: true },
        })
      : Promise.resolve([]),
  ]);
  const donorMap = new Map(donors.map((d) => [d.id, d.name]));
  const linkMap = new Map(givingLinks.map((l) => [l.id, l.internalName]));
  const refundByTransfer = new Map<string, number>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    refundByTransfer.set(r.finixOriginalTransferId, (refundByTransfer.get(r.finixOriginalTransferId) || 0) + (r.amountCents || 0));
  }
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const settlementIds = transfers.map((t) => t.finixSettlementId).filter((id): id is string => Boolean(id));
  const settlements = settlementIds.length
    ? await prisma.finixSettlement.findMany({
        where: { finixSettlementId: { in: settlementIds } },
        select: { finixSettlementId: true, state: true, settledAt: true },
      })
    : [];
  const settlementMap = new Map(settlements.map((s) => [s.finixSettlementId, s]));

  return payments.map((p) => {
    const refundedCents = p.finixTransferId ? refundByTransfer.get(p.finixTransferId) || 0 : 0;
    const transfer = p.finixTransferId ? transferMap.get(p.finixTransferId) : undefined;
    const settlement = transfer?.finixSettlementId ? settlementMap.get(transfer.finixSettlementId) : undefined;
    return {
      paymentId: p.id,
      finixTransferId: p.finixTransferId,
      createdAt: p.createdAt,
      donorName: formatPersonName(p.donorId ? donorMap.get(p.donorId) : null),
      givingLinkName: p.givingLinkId ? linkMap.get(p.givingLinkId) || null : null,
      paymentMethodType: p.paymentMethodType,
      amountCents: p.amountCents,
      feeCents: transfer?.feeCents || 0,
      refundedCents,
      netCents: p.amountCents - refundedCents,
      status: p.status,
      settlementId: settlement?.finixSettlementId || null,
      settlementState: settlement?.state || null,
      settledAt: settlement?.settledAt || null,
    };
  });
}

/** Reuses the same subscription candidate loader the Subscriptions/
 * Recurring Donors pages already use — not a second reporting system. */
export async function loadTeamMemberRecurring(churchId: string, userId: string) {
  return loadSubscriptionCandidates(churchId, { attributedUserId: userId });
}
