import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

const MANAGEABLE_ORG_ROLES = ["church_admin", "owner", "admin", "fundraiser", "viewer"] as const;

/**
 * Per-team-member reporting metrics — read-only, OWNER/authorized ADMIN
 * only (canManageTeam, same gate as the Team page itself). Every figure is
 * derived from Payment/GivingLink/FinixSubscription attribution fields
 * already used throughout the dashboard scoping system, batched into a
 * handful of grouped queries rather than one query per member.
 */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSettingsPermissions(auth.rawRole);
  if (!permissions.canManageTeam) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await prisma.user.findMany({
    where: { churchId: auth.churchId, role: { in: [...MANAGEABLE_ORG_ROLES] }, disabledAt: null },
    select: { id: true, email: true, lastLoginAt: true },
  });
  const memberIds = members.map((m) => m.id);
  if (memberIds.length === 0) return NextResponse.json({ metrics: [] });

  const [activeLinkCounts, payments, subscriptions] = await Promise.all([
    prisma.givingLink.groupBy({
      by: ["ownerUserId"],
      where: { churchId: auth.churchId, ownerUserId: { in: memberIds }, status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: { churchId: auth.churchId, attributedUserId: { in: memberIds } },
      select: { attributedUserId: true, finixTransferId: true, amountCents: true, status: true, createdAt: true, donorId: true },
    }),
    prisma.finixSubscription.findMany({
      where: { churchId: auth.churchId, attributedUserId: { in: memberIds }, donorId: { not: null } },
      select: { attributedUserId: true, donorId: true, createdAt: true },
    }),
  ]);

  const activeLinksByUser = new Map(activeLinkCounts.map((r) => [r.ownerUserId as string, r._count._all]));

  const succeededTransferIds: string[] = [];
  const transferIdToUser = new Map<string, string>();
  const grossByUser = new Map<string, number>();
  const txCountByUser = new Map<string, number>();
  const lastPaymentByUser = new Map<string, Date>();
  for (const p of payments) {
    if (!p.attributedUserId) continue;
    txCountByUser.set(p.attributedUserId, (txCountByUser.get(p.attributedUserId) || 0) + 1);
    const existingLast = lastPaymentByUser.get(p.attributedUserId);
    if (!existingLast || p.createdAt > existingLast) lastPaymentByUser.set(p.attributedUserId, p.createdAt);
    if ((p.status || "").toUpperCase() === "SUCCEEDED") {
      grossByUser.set(p.attributedUserId, (grossByUser.get(p.attributedUserId) || 0) + (p.amountCents || 0));
      if (p.finixTransferId) {
        succeededTransferIds.push(p.finixTransferId);
        transferIdToUser.set(p.finixTransferId, p.attributedUserId);
      }
    }
  }

  const refunds = succeededTransferIds.length
    ? await prisma.finixRefundOrReversal.findMany({
        where: { churchId: auth.churchId, finixOriginalTransferId: { in: succeededTransferIds } },
        select: { finixOriginalTransferId: true, amountCents: true },
      })
    : [];
  const refundByUser = new Map<string, number>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    const userId = transferIdToUser.get(r.finixOriginalTransferId);
    if (!userId) continue;
    refundByUser.set(userId, (refundByUser.get(userId) || 0) + (r.amountCents || 0));
  }

  const recurringDonorsByUser = new Map<string, Set<string>>();
  let lastSubByUser = new Map<string, Date>();
  for (const s of subscriptions) {
    if (!s.attributedUserId || !s.donorId) continue;
    const set = recurringDonorsByUser.get(s.attributedUserId) ?? new Set<string>();
    set.add(s.donorId);
    recurringDonorsByUser.set(s.attributedUserId, set);
    const existingLast = lastSubByUser.get(s.attributedUserId);
    if (!existingLast || s.createdAt > existingLast) lastSubByUser.set(s.attributedUserId, s.createdAt);
  }

  const metrics = members.map((m) => {
    const gross = grossByUser.get(m.id) || 0;
    const refunded = refundByUser.get(m.id) || 0;
    const candidateDates = [m.lastLoginAt, lastPaymentByUser.get(m.id), lastSubByUser.get(m.id)].filter(Boolean) as Date[];
    const lastActivity = candidateDates.length ? new Date(Math.max(...candidateDates.map((d) => d.getTime()))) : null;
    return {
      userId: m.id,
      email: m.email,
      activeGivingLinkCount: activeLinksByUser.get(m.id) || 0,
      transactionCount: txCountByUser.get(m.id) || 0,
      grossAttributedCents: gross,
      refundAmountCents: refunded,
      netAttributedCents: gross - refunded,
      recurringDonorCount: recurringDonorsByUser.get(m.id)?.size || 0,
      lastActivity,
    };
  });

  return NextResponse.json({ metrics });
}
