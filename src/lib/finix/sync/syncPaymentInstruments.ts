import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";
import { upsertDonorFromIdentity } from "@/lib/finix/sync/syncDonor";

/**
 * Confirmed against a real GET /payment_instruments/{id}: there is no
 * "state" field on this resource at all, only enabled (boolean) and
 * disabled_code/disabled_message when enabled is false. Finix's own
 * dashboard's "Enabled"/"Disabled" label is derived from this, not read
 * off a state field — deriving ours the same way instead of reading a
 * field that was always silently null.
 */
function deriveInstrumentState(instrument: { enabled?: boolean; disabled_code?: string | null }) {
  if (instrument.disabled_code === "DELETED") return "DELETED";
  return instrument.enabled ? "ENABLED" : "DISABLED";
}

/**
 * Syncs a single payment instrument's safe/masked metadata into
 * FinixPaymentInstrumentSnapshot. Never stores full card/bank numbers —
 * only last4, brand, and expiration, matching Finix's own masked response.
 * Also upserts a Donor from the instrument's linked identity (when a
 * churchId is known) and links it via donorId.
 */
export async function syncPaymentInstrument(
  finixPaymentInstrumentId: string,
  opts?: { churchId?: string; donorId?: string }
) {
  const instrument = await finixClient.getPaymentInstrument(finixPaymentInstrumentId);

  let donorId = opts?.donorId ?? null;
  if (!donorId && opts?.churchId && instrument.identity) {
    donorId = await upsertDonorFromIdentity(instrument.identity, opts.churchId);
  }

  await prisma.finixPaymentInstrumentSnapshot.upsert({
    where: { finixPaymentInstrumentId },
    create: {
      finixPaymentInstrumentId,
      churchId: opts?.churchId ?? null,
      donorId,
      finixIdentityId: instrument.identity ?? null,
      instrumentType: instrument.instrument_type ?? null,
      paymentMethodType: instrument.type ?? null,
      cardBrand: instrument.brand ?? null,
      cardLast4: instrument.last_four ?? null,
      cardExpirationMonth: instrument.expiration_month ?? null,
      cardExpirationYear: instrument.expiration_year ?? null,
      bankLast4: instrument.masked_account_number ?? null,
      bankAccountType: instrument.account_type ?? null,
      accountHolderName: instrument.name ?? null,
      state: deriveInstrumentState(instrument),
      enabled: Boolean(instrument.enabled),
      disabledCode: instrument.disabled_code ?? null,
      disabledMessage: instrument.disabled_message ?? null,
      securityCodeVerification: instrument.security_code_verification ?? null,
      addressVerification: instrument.address_verification ?? null,
      issuerCountry: instrument.issuer_country ?? null,
      addressCountry: instrument.address?.country ?? null,
      rawJsonRedacted: redactFinixPayload(instrument),
      createdAtFinix: instrument.created_at ? new Date(instrument.created_at) : null,
      updatedAtFinix: instrument.updated_at ? new Date(instrument.updated_at) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      state: deriveInstrumentState(instrument),
      enabled: Boolean(instrument.enabled),
      disabledCode: instrument.disabled_code ?? null,
      disabledMessage: instrument.disabled_message ?? null,
      securityCodeVerification: instrument.security_code_verification ?? null,
      addressVerification: instrument.address_verification ?? null,
      issuerCountry: instrument.issuer_country ?? null,
      addressCountry: instrument.address?.country ?? null,
      rawJsonRedacted: redactFinixPayload(instrument),
      updatedAtFinix: instrument.updated_at ? new Date(instrument.updated_at) : null,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Backfills every payment instrument linked to a Finix identity. Uses the
 * confirmed GET /identities/{id}/payment_instruments endpoint (same
 * sub-resource pattern already proven by listIdentityMerchants).
 * instrumentUse is left null here — it's a WGC-only classification
 * (donor_payment_method / payout_bank / subscription_billing) that must be
 * set by the caller based on which flow the instrument came from.
 */
export async function syncPaymentInstrumentsForIdentity(
  finixIdentityId: string,
  opts?: { churchId?: string }
) {
  const response = await finixClient.listIdentityPaymentInstruments(finixIdentityId);
  const instruments: any[] = response?._embedded?.payment_instruments ?? [];

  let created = 0;
  let updated = 0;

  for (const instrument of instruments) {
    const existing = await prisma.finixPaymentInstrumentSnapshot.findUnique({
      where: { finixPaymentInstrumentId: instrument.id },
    });

    await syncPaymentInstrument(instrument.id, { churchId: opts?.churchId });

    if (existing) updated++;
    else created++;
  }

  return { processed: instruments.length, created, updated };
}
