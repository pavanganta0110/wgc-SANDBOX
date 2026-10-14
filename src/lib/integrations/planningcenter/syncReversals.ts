import { prisma } from "@/lib/prisma";
import { getClientForChurch } from "./service";
import { effectivePaymentStatuses } from "./giftOutcomes";
import { classifyWriteError } from "./syncEngine";
import { deleteDonation, getBatch, getDonation, issueRefund, markDonationFailed } from "./givingApi";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * Keeps Planning Center in step when a gift that was already sent is later refunded, returned by the bank, or
 * fails. Sending the moment a gift is paid means this will happen, so it is part of the same feature.
 *
 *  - A gift in a batch the church hasn't committed yet is simply REMOVED (the batch is a staging area).
 *  - In a committed batch, a refund is recorded with issue_refund, and a return/failure with mark_failed (the gift
 *    stays in the donor's history but is excluded from totals and statements).
 *  - Every action is confirmed by READING the donation afterwards, and re-checks first, so a repeat is harmless.
 *  - A PARTIAL refund is not changed automatically (Planning Center's refund is all-or-nothing here); it stays on
 *    the "changed after it was sent" list for the church to adjust.
 */

const FULL_REVERSAL_STATUSES = ["REFUNDED", "RETURNED", "FAILED", "CANCELED"];

export interface ReversalSummary {
  reversed: number;
  waiting: number;
  flagged: number;
}

export async function reverseChangedGifts(
  churchId: string,
  options: { client?: PlanningCenterClient; paymentIds?: string[]; limit?: number; now?: () => Date } = {}
): Promise<ReversalSummary> {
  const summary: ReversalSummary = { reversed: 0, waiting: 0, flagged: 0 };
  const now = options.now ?? (() => new Date());

  const candidates = await prisma.planningCenterDonationRecord.findMany({
    where: { churchId, status: "CREATED", pcoDonationId: { not: null }, ...(options.paymentIds ? { paymentId: { in: options.paymentIds } } : {}) },
    orderBy: { updatedAt: "asc" },
    take: options.limit ?? 500,
  });
  if (candidates.length === 0) return summary;

  const rows = await prisma.payment.findMany({
    where: { churchId, id: { in: candidates.map((c) => c.paymentId) } },
    select: { id: true, status: true, amountCents: true, finixTransferId: true },
  });
  // A refund does NOT change Payment.status, so the real state comes from the refund and return rows.
  const statusById = await effectivePaymentStatuses(churchId, rows);
  const payments = rows.map((p) => ({ id: p.id, status: statusById.get(p.id) ?? p.status })).filter((p) => FULL_REVERSAL_STATUSES.includes(p.status));
  if (payments.length === 0) return summary;
  const paymentById = new Map(payments.map((p) => [p.id, p]));

  const client = options.client ?? (await getClientForChurch(churchId));

  const markReversed = async (recordId: string, paymentStatus: string) => {
    await prisma.planningCenterDonationRecord.update({ where: { id: recordId }, data: { status: "REVERSED", reversedAt: now(), skippedReason: paymentStatus, attachPersonPending: false } });
    summary.reversed++;
  };
  const alreadyReflected = (d: Awaited<ReturnType<typeof getDonation>>) => d === null || d.refunded === true || d.paymentStatus === "failed";

  for (const rec of candidates) {
    const payment = paymentById.get(rec.paymentId);
    if (!payment) continue;
    const donationId = rec.pcoDonationId as string;

    const before = await getDonation(client, donationId);
    if (alreadyReflected(before)) {
      await markReversed(rec.id, payment.status);
      continue;
    }

    const syncRecord = await prisma.planningCenterSyncRecord.findFirst({ where: { id: rec.syncRecordId, churchId }, select: { pcoBatchId: true } });
    const batch = syncRecord?.pcoBatchId ? await getBatch(client, syncRecord.pcoBatchId) : null;

    let refused = false; // Planning Center gave a definite "no" (as opposed to an answer we never got)
    try {
      if (batch?.status === "in_progress") await deleteDonation(client, donationId);
      else if (payment.status === "REFUNDED") await issueRefund(client, donationId, now().toISOString().slice(0, 10));
      else await markDonationFailed(client, donationId, payment.status === "RETURNED" ? "Returned by the bank" : "The payment failed");
    } catch (err) {
      const kind = classifyWriteError(err);
      // No permission or no sign-in: nothing more can be done right now.
      if (kind === "DENIED" || kind === "AUTH") throw err;
      refused = kind === "REJECTED" || kind === "NOT_FOUND";
      // Either way, what actually happened is settled by looking at what Planning Center has.
    }

    const after = await getDonation(client, donationId);
    if (alreadyReflected(after)) {
      await markReversed(rec.id, payment.status);
    } else if (refused) {
      // Planning Center said no (for example the gift isn't refundable through the API): a person must do it there.
      await prisma.planningCenterDonationRecord.update({
        where: { id: rec.id },
        data: {
          status: "NEEDS_REVIEW",
          lastErrorCode: "REVERSAL_NOT_APPLIED",
          lastErrorMessage:
            payment.status === "REFUNDED"
              ? "This gift was refunded in WGC, but Planning Center wouldn't refund it automatically. Refund it in Planning Center."
              : "This gift was returned or failed in WGC, but Planning Center wouldn't update it automatically. Mark it failed in Planning Center.",
        },
      });
      summary.flagged++;
    } else {
      summary.waiting++; // not confirmed yet: it will be checked again
    }
  }
  return summary;
}
