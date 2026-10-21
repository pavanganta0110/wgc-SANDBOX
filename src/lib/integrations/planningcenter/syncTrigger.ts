import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPlanningCenterSyncEnabled } from "./config";
import { dateKeyOf } from "./giftPlan";
import { processDaySync } from "./syncEngine";
import { reverseChangedGifts } from "./syncReversals";
import { attachPendingPeople } from "./syncAttach";
import { syncProfileForDonor } from "./profileSync";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * "Send it the moment it's paid."
 *
 * Called when a payment succeeds (or changes state). Everything here is BEST EFFORT and must never be able to
 * affect the donor's payment: it runs after the response has been sent, swallows every error, and does nothing at
 * all (not even a database query) while the platform switch is off. The daily sweep (syncRunner) is the safety net
 * for anything this misses, so a failure here costs minutes, never a gift.
 */

const MAX_CONTENTION_RETRIES = 3;
const CONTENTION_WAIT_MS = 1500;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function syncAfterPaymentChange(
  paymentId: string,
  options: { client?: PlanningCenterClient; sleep?: (ms: number) => Promise<void> } = {}
): Promise<void> {
  try {
    if (!isPlanningCenterSyncEnabled()) return;

    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, churchId: true, donorId: true, status: true, createdAt: true } });
    if (!payment) return;

    const config = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId: payment.churchId } });
    if (!config || config.syncMode !== "LIVE") return;

    // "People only": no donation is sent. The donor's "WGC Giving" section is refreshed instead, for ANY change to
    // the payment (a new gift, a refund, a bank return), because the totals move in every one of those cases.
    if (config.syncTarget === "PROFILE_FIELDS") {
      if (payment.donorId) await syncProfileForDonor(payment.churchId, payment.donorId, { client: options.client });
      return;
    }
    if (config.sendTiming !== "ON_PAYMENT") return;

    const sleep = options.sleep ?? defaultSleep;
    if (payment.status === "SUCCEEDED") {
      // Many gifts can arrive at once and only one worker owns the day's batch at a time. The worker that wins
      // sends everything waiting (including this gift); if we lost, wait a moment and look again.
      for (let attempt = 0; attempt <= MAX_CONTENTION_RETRIES; attempt++) {
        const outcome = await processDaySync(payment.churchId, dateKeyOf(payment.createdAt), { client: options.client });
        if (outcome !== "CONTENDED") break;
        await sleep(CONTENTION_WAIT_MS);
      }
    }

    // A change in either direction: a gift already sent that was refunded/returned/failed is updated in Planning
    // Center, and a gift sent without a person gets one once its donor is matched. Both are no-ops when not needed.
    await reverseChangedGifts(payment.churchId, { client: options.client, paymentIds: [payment.id] });
    await attachPendingPeople(payment.churchId, { client: options.client, limit: 20 });
  } catch (err) {
    console.error(`planning-center: sending payment ${paymentId} failed (the daily sweep will retry):`, err instanceof Error ? err.message : err);
  }
}

/**
 * Fire-and-forget hook for the places a payment succeeds or changes state. Costs nothing while the platform switch is
 * off. Runs after the response via Next's `after`; outside a request (a script or a test) it just runs in the background.
 */
export function triggerPlanningCenterSync(paymentId: string): void {
  if (!isPlanningCenterSyncEnabled()) return;
  const work = () => syncAfterPaymentChange(paymentId);
  try {
    after(work);
  } catch {
    void work();
  }
}

/**
 * The same hook for events that arrive by Finix transfer id (a refund, or a bank return) rather than by payment id.
 * Looks the payment up only after the response, and only when the platform switch is on.
 */
export function triggerPlanningCenterSyncForTransfer(churchId: string | null | undefined, finixTransferId: string | null | undefined): void {
  if (!isPlanningCenterSyncEnabled() || !churchId || !finixTransferId) return;
  const work = async () => {
    try {
      const payment = await prisma.payment.findFirst({ where: { churchId, finixTransferId }, select: { id: true } });
      if (payment) await syncAfterPaymentChange(payment.id);
    } catch (err) {
      console.error(`planning-center: could not look up payment for transfer ${finixTransferId}:`, err instanceof Error ? err.message : err);
    }
  };
  try {
    after(work);
  } catch {
    void work();
  }
}
