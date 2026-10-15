import { prisma } from "@/lib/prisma";
import { isPlanningCenterSyncEnabled } from "./config";
import { computeStoredGivingReadiness } from "./syncConfig";
import { effectivePaymentStatuses } from "./giftOutcomes";
import { describePaymentChange, HELD_MESSAGES, SKIP_MESSAGES, type SkipReason, type SendTiming, type SyncMode, type SyncOverview, type SyncTarget, type UnmatchedDonorPolicy } from "./syncTypes";

const LIST_LIMIT = 50;
const PAYMENT_CHANGED = ["REFUNDED", "PARTIALLY_REFUNDED", "RETURNED", "FAILED", "CANCELED"];

/** Everything the gift-sync panel shows, from our own database. No Planning Center calls. */
export async function getSyncOverview(churchId: string): Promise<SyncOverview> {
  const config = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
  const [readiness, dryRuns, records, linkedPeople, updatedPeople, lastProfile, connection] = await Promise.all([
    computeStoredGivingReadiness(churchId),
    prisma.planningCenterSyncAttempt.count({ where: { churchId, outcome: "DRY_RUN" } }),
    // Only the current sync generation: records from a previous Planning Center organization aren't shown.
    prisma.planningCenterSyncRecord.findMany({ where: { churchId, syncVersion: config?.syncVersion ?? 1 }, orderBy: { updatedAt: "desc" }, take: 25 }),
    prisma.planningCenterPersonLink.count({ where: { churchId, status: "LINKED" } }),
    prisma.planningCenterPersonLink.count({ where: { churchId, status: "LINKED", profileSyncedAt: { not: null } } }),
    prisma.planningCenterPersonLink.findFirst({ where: { churchId, profileSyncedAt: { not: null } }, orderBy: { profileSyncedAt: "desc" }, select: { profileSyncedAt: true } }),
    prisma.planningCenterConnection.findUnique({ where: { churchId }, select: { status: true } }),
  ]);
  const syncTarget = (config?.syncTarget ?? "GIFTS") as SyncTarget;
  // "People only" needs no Giving setup at all: just a working connection.
  const ready = syncTarget === "PROFILE_FIELDS" ? connection?.status === "CONNECTED" : readiness.ready;
  const readinessReasons = syncTarget === "PROFILE_FIELDS" ? (ready ? [] : ["Reconnect Planning Center first."]) : readiness.reasons;

  const recordIds = records.map((r) => r.id);
  const donations = recordIds.length ? await prisma.planningCenterDonationRecord.findMany({ where: { syncRecordId: { in: recordIds } } }) : [];
  const byRecord = new Map<string, typeof donations>();
  for (const d of donations) byRecord.set(d.syncRecordId, [...(byRecord.get(d.syncRecordId) ?? []), d]);
  const settlementOf = new Map(records.map((r) => [r.id, r.settlementId]));

  const count = (rows: typeof donations, status: string) => rows.filter((d) => d.status === status).length;
  const recordRows = records.map((r) => {
    const rows = byRecord.get(r.id) ?? [];
    return {
      id: r.id,
      settlementId: r.settlementId,
      status: r.status,
      blockedReason: r.blockedReason,
      lastErrorMessage: r.lastErrorMessage,
      pcoBatchId: r.pcoBatchId,
      commitStatus: r.commitStatus,
      updatedAt: r.updatedAt.toISOString(),
      counts: { created: count(rows, "CREATED"), skipped: count(rows, "SKIPPED"), held: count(rows, "HELD"), needsReview: count(rows, "NEEDS_REVIEW"), failed: count(rows, "FAILED"), pending: count(rows, "PENDING") + count(rows, "SENDING") },
    };
  });

  const needsReview = donations
    .filter((d) => d.status === "NEEDS_REVIEW" || d.status === "FAILED")
    .slice(0, LIST_LIMIT)
    .map((d) => ({
      donationId: d.id,
      syncRecordId: d.syncRecordId,
      settlementId: settlementOf.get(d.syncRecordId) ?? "",
      status: d.status as "NEEDS_REVIEW" | "FAILED",
      amountCents: d.amountCents,
      receivedOn: d.receivedOn,
      message: d.lastErrorMessage ?? "This gift needs a decision.",
      code: d.lastErrorCode ?? null,
    }));

  // Held gifts (waiting on a donor match) across ALL deposits, not just the recent ones.
  const [heldAll, skippedAll] = await Promise.all([
    prisma.planningCenterDonationRecord.findMany({ where: { churchId, status: "HELD" }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT }),
    prisma.planningCenterDonationRecord.findMany({ where: { churchId, status: "SKIPPED" }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT }),
  ]);
  const [heldTotal, skippedTotal] = await Promise.all([
    prisma.planningCenterDonationRecord.count({ where: { churchId, status: "HELD" } }),
    prisma.planningCenterDonationRecord.count({ where: { churchId, status: "SKIPPED" } }),
  ]);
  const donorIds = [...new Set(heldAll.map((d) => d.donorId).filter((id): id is string => Boolean(id)))];
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { churchId, id: { in: donorIds } }, select: { id: true, name: true } }) : [];
  const donorName = new Map(donors.map((d) => [d.id, d.name]));

  // Gifts already in Planning Center whose payment changed afterwards.
  const created = await prisma.planningCenterDonationRecord.findMany({ where: { churchId, status: "CREATED" }, orderBy: { updatedAt: "desc" }, take: 2000 });
  const createdPayments = created.length
    ? await prisma.payment.findMany({ where: { churchId, id: { in: created.map((c) => c.paymentId) } }, select: { id: true, status: true, amountCents: true, finixTransferId: true } })
    : [];
  // A refund doesn't change Payment.status; the real state comes from the refund and return rows.
  const effective = await effectivePaymentStatuses(churchId, createdPayments);
  const statusOf = new Map([...effective].filter(([, status]) => PAYMENT_CHANGED.includes(status)));
  const batchOf = new Map<string, string | null>();
  if (created.length) {
    const syncRows = await prisma.planningCenterSyncRecord.findMany({ where: { id: { in: [...new Set(created.map((c) => c.syncRecordId))] } }, select: { id: true, pcoBatchId: true } });
    for (const r of syncRows) batchOf.set(r.id, r.pcoBatchId);
  }
  const needsAttention = created
    .filter((c) => statusOf.has(c.paymentId))
    .slice(0, LIST_LIMIT)
    .map((c) => ({
      paymentId: c.paymentId,
      amountCents: c.amountCents,
      receivedOn: c.receivedOn,
      paymentStatus: statusOf.get(c.paymentId)!,
      pcoDonationId: c.pcoDonationId,
      pcoBatchId: batchOf.get(c.syncRecordId) ?? null,
      message: describePaymentChange(statusOf.get(c.paymentId)!),
    }));

  return {
    platformEnabled: isPlanningCenterSyncEnabled(),
    settings: {
      syncMode: (config?.syncMode ?? "OFF") as SyncMode,
      sendTiming: (config?.sendTiming ?? "ON_PAYMENT") as SendTiming,
      syncTarget,
      unmatchedDonorPolicy: (config?.unmatchedDonorPolicy ?? "HOLD_FOR_REVIEW") as UnmatchedDonorPolicy,
      autoCommitBatches: config?.autoCommitBatches ?? false,
      enabledAt: config?.enabledAt ? config.enabledAt.toISOString() : null,
    },
    ready,
    readinessReasons,
    hasDryRun: dryRuns > 0,
    records: recordRows,
    needsReview,
    held: {
      total: heldTotal,
      items: heldAll.map((d) => ({
        donationId: d.id,
        donorId: d.donorId,
        donorName: d.donorId ? donorName.get(d.donorId) ?? null : null,
        amountCents: d.amountCents,
        receivedOn: d.receivedOn,
        reason: d.skippedReason ?? "",
        message: HELD_MESSAGES[d.skippedReason ?? ""] ?? "Waiting for a Planning Center person.",
      })),
    },
    needsAttention,
    profile: { linkedPeople, updatedPeople, lastUpdatedAt: lastProfile?.profileSyncedAt ? lastProfile.profileSyncedAt.toISOString() : null },
    skipped: {
      total: skippedTotal,
      items: skippedAll.map((d) => ({
        paymentId: d.paymentId,
        amountCents: d.amountCents,
        receivedOn: d.receivedOn,
        reason: d.skippedReason ?? "",
        message: SKIP_MESSAGES[(d.skippedReason ?? "") as SkipReason] ?? "This gift wasn't sent.",
      })),
    },
  };
}
