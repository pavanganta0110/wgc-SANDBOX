import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

export interface CreatedViaBackfillResult {
  scanned: number;
  updated: number;
  noRawPayload: number;
}

/**
 * Backfills FinixTransfer.createdVia for existing rows from their own
 * already-stored rawJsonRedacted — Finix's real `created_via` field
 * ("SUBSCRIPTION", "PAYMENT_LINK", "VIRTUAL_TERMINAL", "UNKNOWN") was
 * confirmed present in the raw payload before this column existed to
 * capture it at write time. No new Finix API calls needed; this is a pure
 * re-read of data already synced.
 */
export async function backfillTransferCreatedVia(churchId: string): Promise<CreatedViaBackfillResult> {
  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, createdVia: null },
    select: { id: true, rawJsonRedacted: true },
  });

  let updated = 0;
  let noRawPayload = 0;

  for (const t of transfers) {
    const raw = t.rawJsonRedacted as any;
    const createdVia = raw && typeof raw === "object" && typeof raw.created_via === "string" ? raw.created_via : null;
    if (!createdVia) {
      noRawPayload += 1;
      continue;
    }
    await prisma.finixTransfer.update({ where: { id: t.id }, data: { createdVia } });
    updated += 1;
  }

  return { scanned: transfers.length, updated, noRawPayload };
}

export interface NormalizationBackfillResult {
  scanned: number;
  updated: number;
  unchanged: number;
}

/**
 * Backfills normalizedEmail/normalizedPhone on existing donors that predate
 * those columns being populated at write time. Idempotent — re-running
 * against already-normalized rows only touches donors whose normalized
 * value doesn't already match, never nulls out anything, and only ever
 * derives the normalized value FROM the existing email/phone (never
 * invents or guesses a new email/phone).
 */
export async function backfillDonorNormalization(churchId: string): Promise<NormalizationBackfillResult> {
  const donors = await prisma.donor.findMany({
    where: { churchId, OR: [{ email: { not: null } }, { phone: { not: null } }] },
    select: { id: true, email: true, phone: true, normalizedEmail: true, normalizedPhone: true },
  });

  let updated = 0;
  let unchanged = 0;

  for (const donor of donors) {
    const normalizedEmail = normalizeEmail(donor.email);
    const normalizedPhone = normalizePhone(donor.phone);
    const needsEmailUpdate = normalizedEmail !== donor.normalizedEmail;
    const needsPhoneUpdate = normalizedPhone !== donor.normalizedPhone;

    if (!needsEmailUpdate && !needsPhoneUpdate) {
      unchanged += 1;
      continue;
    }

    await prisma.donor.update({
      where: { id: donor.id },
      data: {
        ...(needsEmailUpdate ? { normalizedEmail } : {}),
        ...(needsPhoneUpdate ? { normalizedPhone } : {}),
      },
    });
    updated += 1;
  }

  return { scanned: donors.length, updated, unchanged };
}

export interface OrphanedPaymentBackfillResult {
  scanned: number;
  linked: number;
  unresolved: number;
}

/**
 * Links Payment rows with a null donorId to the correct donor, matching in
 * the same priority order as webhook resolution:
 *   1. finixTransferId -> FinixTransfer.finixPaymentInstrumentId -> instrument.donorId
 *   2. normalized email/phone match within this organization
 * Never overwrites an existing donorId (only touches rows where it's null),
 * and never creates a donor — a payment that matches nothing stays
 * unresolved rather than being attached to a guessed donor.
 */
export async function backfillOrphanedPayments(churchId: string): Promise<OrphanedPaymentBackfillResult> {
  const orphaned = await prisma.payment.findMany({
    where: { churchId, donorId: null },
    select: { id: true, finixTransferId: true, finixPaymentInstrumentId: true },
  });
  if (orphaned.length === 0) return { scanned: 0, linked: 0, unresolved: 0 };

  const transferIds = orphaned.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id));
  const transfers = transferIds.length
    ? await prisma.finixTransfer.findMany({ where: { churchId, finixTransferId: { in: transferIds } }, select: { finixTransferId: true, finixPaymentInstrumentId: true } })
    : [];
  const transferToInstrument = new Map(transfers.map((t) => [t.finixTransferId, t.finixPaymentInstrumentId]));

  const instrumentIds = [
    ...new Set([
      ...orphaned.map((p) => p.finixPaymentInstrumentId).filter((id): id is string => Boolean(id)),
      ...transfers.map((t) => t.finixPaymentInstrumentId).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } }, select: { finixPaymentInstrumentId: true, donorId: true } })
    : [];
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId]));

  let linked = 0;
  let unresolved = 0;

  for (const payment of orphaned) {
    const directInstrumentId = payment.finixPaymentInstrumentId ?? (payment.finixTransferId ? transferToInstrument.get(payment.finixTransferId) : undefined);
    const donorId = directInstrumentId ? instrumentToDonor.get(directInstrumentId) : undefined;

    if (donorId) {
      await prisma.payment.update({ where: { id: payment.id }, data: { donorId } });
      linked += 1;
    } else {
      unresolved += 1;
    }
  }

  return { scanned: orphaned.length, linked, unresolved };
}
