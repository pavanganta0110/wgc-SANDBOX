import { finixClient } from "@/lib/finix/client";

export type LinkInstrumentResult = "LINKED" | "SKIPPED" | "FAILED";

/**
 * After WGC's server creates a donor's BANK instrument for a payment to a
 * church, links that instrument to the church's Finix merchant so the bank
 * account's validation fees (Plaid / account validation) are billed through
 * the merchant's fee profile rather than defaulting to WGC's application
 * (Finix Payment Instrument Association).
 *
 * - Off unless FINIX_BANK_INSTRUMENT_LINK_ENABLED is exactly "true", so
 *   changing who pays is an explicit switch per environment.
 * - Bank accounts only (cards have no such fee).
 * - Best-effort: never throws, never fails or delays a donation beyond one
 *   bounded Finix call. Call it OUTSIDE any database transaction.
 * - Never log tokens or account details: only ids and the outcome.
 */
export async function linkBankInstrumentToMerchant(params: {
  /** Finix's payment instrument object: `type` is "BANK_ACCOUNT" | "PAYMENT_CARD" | "TOKEN" | wallet types. */
  instrument: { id?: string | null; type?: string | null; instrument_type?: string | null } | null | undefined;
  merchantId: string | null | undefined;
  /** Where this was called from, for logs ("donate", "take-payment", ...). */
  source: string;
}): Promise<LinkInstrumentResult> {
  const { instrument, merchantId, source } = params;
  if (process.env.FINIX_BANK_INSTRUMENT_LINK_ENABLED !== "true") return "SKIPPED";
  if (!instrument?.id || !merchantId) return "SKIPPED";
  if ((instrument.type ?? instrument.instrument_type) !== "BANK_ACCOUNT") return "SKIPPED";

  try {
    await finixClient.createPaymentInstrumentAssociation({
      merchant_id: merchantId,
      payment_instrument_id: instrument.id,
      tags: { source: "wgc", flow: source },
    });
    console.log("FINIX_INSTRUMENT_LINK", { outcome: "LINKED", source, instrumentId: instrument.id, merchantId });
    return "LINKED";
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.error("FINIX_INSTRUMENT_LINK", { outcome: "FAILED", source, instrumentId: instrument.id, merchantId, status: e?.status ?? null, message: e?.message ?? String(err) });
    return "FAILED";
  }
}
