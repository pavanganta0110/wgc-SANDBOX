import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { redactFinixPayload } from "@/lib/finix/redact";
import { syncFeesForTransfer } from "@/lib/finix/sync/syncFees";

/**
 * Webhooks must not be the only synchronization method for payment state —
 * this is the self-healing fallback for a Transfer stuck showing a state
 * WGC never received the follow-up webhook for (see webhook-delivery gap
 * confirmed for the ACH bug this was built to fix).
 */
export const PAYMENT_RECONCILE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
// A brand-new PENDING payment is normal (ACH/card processing takes time) —
// only one that's stayed PENDING past this age is worth an extra Finix call.
export const PENDING_PAYMENT_MIN_AGE_MS = 60 * 1000; // 1 minute

const TERMINAL_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

export function isStaleEnoughToReconcile(lastReconciledAt: Date | null | undefined): boolean {
  return !lastReconciledAt || Date.now() - lastReconciledAt.getTime() > PAYMENT_RECONCILE_THROTTLE_MS;
}

function normalizeProcessorState(state: string | null | undefined): string {
  return (state || "PENDING").toUpperCase();
}

/**
 * Out-of-order protection: a SUCCEEDED (or otherwise terminal) local state
 * must never be regressed back to PENDING by a stale/duplicate event. Once
 * terminal, only re-applying the exact same terminal state is a no-op; any
 * different value is logged and ignored rather than silently applied.
 */
export function shouldApplyTransferState(currentState: string | null, incomingState: string | null): boolean {
  const current = normalizeProcessorState(currentState);
  const incoming = normalizeProcessorState(incomingState);
  if (current === incoming) return true;
  if (TERMINAL_STATES.has(current) && !TERMINAL_STATES.has(incoming)) return false;
  return true;
}

export interface TransferReconcileResult {
  reconciled: boolean;
  changed: boolean;
  newState?: string;
  error?: string;
}

/** Primary matching key is always the Finix Transfer ID itself — never amount/name/date/last-four, which are only ever used by a human to *locate* the right record before confirming the Transfer ID. */
export async function reconcilePendingTransfer(finixTransferId: string): Promise<TransferReconcileResult> {
  try {
    const local = await prisma.finixTransfer.findUnique({ where: { finixTransferId } });
    if (!local) return { reconciled: false, changed: false, error: "Transfer not found locally" };

    const remote = await finixClient.getTransfer(finixTransferId);
    const remoteState = normalizeProcessorState(remote.state);
    const currentState = normalizeProcessorState(local.state);

    if (!shouldApplyTransferState(local.state, remote.state)) {
      // A stale/duplicate event tried to regress a terminal state — ignored, not applied.
      await prisma.finixTransfer.update({ where: { finixTransferId }, data: { lastReconciledAt: new Date() } });
      return { reconciled: true, changed: false, newState: currentState };
    }

    const changed = currentState !== remoteState;

    await prisma.finixTransfer.update({
      where: { finixTransferId },
      data: {
        state: remote.state ?? undefined,
        failureCode: remote.failure_code ?? local.failureCode,
        failureMessage: remote.failure_message ?? local.failureMessage,
        rawJsonRedacted: redactFinixPayload(remote),
        updatedAtFinix: remote.updated_at ? new Date(remote.updated_at) : local.updatedAtFinix,
        lastSyncedAt: new Date(),
        lastReconciledAt: new Date(),
      },
    });

    if (changed) {
      const priorPayment = await prisma.payment.findFirst({ where: { finixTransferId } });
      if (priorPayment && priorPayment.status !== remoteState) {
        await prisma.payment.updateMany({
          where: { finixTransferId },
          data: { status: remoteState },
        });

        if (priorPayment.status !== "SUCCEEDED" && remoteState === "SUCCEEDED") {
          try {
            const { sendDonationReceipt } = await import("@/lib/giving/generateReceipt");
            await sendDonationReceipt(priorPayment.id, priorPayment.churchId);
          } catch (err) {
            console.error("Failed to send reconciled donation receipt:", err);
          }
        }
      }

      // Fee reconciliation is triggered separately from settlement
      // association — a fee sync failure must never block the state update
      // that already succeeded above.
      try {
        await syncFeesForTransfer(finixTransferId, local.churchId ?? undefined);
      } catch (err) {
        console.error(`Fee reconciliation failed for ${finixTransferId}:`, err);
      }
    }

    return { reconciled: true, changed, newState: remoteState };
  } catch (err) {
    console.error(`Transfer reconciliation failed for ${finixTransferId}:`, err);
    return { reconciled: false, changed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bounded, throttled reconciliation pass for a church's pending payments —
 * called from page loads (Payments list, payment detail) rather than an
 * unbounded background sweep. Only payments old enough that "still
 * processing" is no longer the likely explanation are re-checked.
 */
export async function reconcilePendingPayments(churchId: string, limit = 25): Promise<{ checked: number; reconciled: number; changed: number }> {
  const cutoff = new Date(Date.now() - PENDING_PAYMENT_MIN_AGE_MS);
  const pending = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      state: "PENDING",
      finixTransferId: { not: undefined },
      createdAtFinix: { lte: cutoff },
      OR: [{ lastReconciledAt: null }, { lastReconciledAt: { lt: new Date(Date.now() - PAYMENT_RECONCILE_THROTTLE_MS) } }],
    },
    select: { finixTransferId: true },
    take: limit,
  });

  if (pending.length === 0) return { checked: 0, reconciled: 0, changed: 0 };

  const results = await Promise.allSettled(pending.map((t) => reconcilePendingTransfer(t.finixTransferId)));
  const reconciled = results.filter((r) => r.status === "fulfilled" && r.value.reconciled).length;
  const changed = results.filter((r) => r.status === "fulfilled" && r.value.changed).length;
  return { checked: pending.length, reconciled, changed };
}
