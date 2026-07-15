import { prisma } from "@/lib/prisma";

export interface TransferAttributionBackfillResult {
  scanned: number;
  updated: number;
  noRawPayload: number;
}

/** Re-derives FinixTransfer.finixSubscriptionId from already-stored rawJsonRedacted — zero new Finix API calls, same pattern as the createdVia backfill. */
export async function backfillTransferSubscriptionId(churchId: string): Promise<TransferAttributionBackfillResult> {
  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixSubscriptionId: null },
    select: { id: true, rawJsonRedacted: true },
  });
  let updated = 0;
  let noRawPayload = 0;
  for (const t of transfers) {
    const raw = t.rawJsonRedacted as any;
    const subscriptionId = raw && typeof raw === "object" && typeof raw.subscription === "string" ? raw.subscription : null;
    if (!subscriptionId) {
      noRawPayload += 1;
      continue;
    }
    await prisma.finixTransfer.update({ where: { id: t.id }, data: { finixSubscriptionId: subscriptionId } });
    updated += 1;
  }
  return { scanned: transfers.length, updated, noRawPayload };
}

export interface SubscriptionDonorBackfillResult {
  scanned: number;
  updated: number;
  noInstrumentDonor: number;
}

/** Re-derives FinixSubscription.donorId for rows synced before donorId denormalization existed — resolved from the already-linked instrument snapshot, never guessed. */
export async function backfillSubscriptionDonorId(churchId: string): Promise<SubscriptionDonorBackfillResult> {
  const subscriptions = await prisma.finixSubscription.findMany({
    where: { churchId, donorId: null, finixPaymentInstrumentId: { not: null } },
    select: { id: true, finixPaymentInstrumentId: true },
  });
  let updated = 0;
  let noInstrumentDonor = 0;
  for (const s of subscriptions) {
    const instrument = await prisma.finixPaymentInstrumentSnapshot.findUnique({
      where: { finixPaymentInstrumentId: s.finixPaymentInstrumentId! },
      select: { donorId: true },
    });
    if (!instrument?.donorId) {
      noInstrumentDonor += 1;
      continue;
    }
    await prisma.finixSubscription.update({ where: { id: s.id }, data: { donorId: instrument.donorId } });
    updated += 1;
  }
  return { scanned: subscriptions.length, updated, noInstrumentDonor };
}
