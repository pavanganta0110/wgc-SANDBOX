import { finixClient } from "@/lib/finix/client";

/**
 * The single source of truth for "which Finix merchant does WGC get paid
 * through for its OWN software charges" — completely separate from any
 * client organization's own Finix merchant (Church.finixMerchantId), which
 * only ever processes that organization's donations/invoices.
 *
 * Reuses the existing Finix API credentials (FINIX_USERNAME/PASSWORD/
 * VERSION/BASE_URL — see src/lib/finix/client.ts) since WGC's billing
 * merchant is just another merchant under the same Finix Application that
 * already issues every client organization's sub-merchant; no second
 * FinixClient/credential set is needed. The only genuinely new credential
 * is FINIX_WGC_BILLING_MERCHANT_ID itself.
 *
 * Fails closed: any code path that would charge WGC's billing merchant
 * must call getWgcBillingMerchantId() (or assertWgcBillingMerchantReady())
 * rather than reading process.env directly, so a missing/misconfigured
 * value throws instead of silently falling back to nothing (which would
 * otherwise look like "no merchant" and could be mistaken for "use the
 * org's own merchant" by a careless caller).
 */

export class WgcBillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WgcBillingConfigError";
  }
}

/** Never accepted from a request/client — env-only, by design. */
export function getWgcBillingMerchantId(): string {
  const id = process.env.FINIX_WGC_BILLING_MERCHANT_ID;
  if (!id) {
    throw new WgcBillingConfigError(
      "FINIX_WGC_BILLING_MERCHANT_ID is not configured — WGC platform-subscription billing cannot proceed without it (fail closed, never falls back to any organization's merchant).",
    );
  }
  return id;
}

/** Optional — only needed if WGC's subscription buyer/seller structure
 * requires a distinct billing identity separate from the merchant id
 * itself. Not required at every call site; read explicitly where used. */
export function getWgcBillingIdentityId(): string | undefined {
  return process.env.FINIX_WGC_BILLING_IDENTITY_ID || undefined;
}

export type FinixEnvironment = "sandbox" | "production";

/** Informational/consistency-check only — the app does not currently branch
 * runtime Finix API behavior on this value (sandbox vs. production is
 * controlled by which FINIX_BASE_URL/credentials are deployed), but this is
 * used to assert FINIX_ENVIRONMENT agrees with FINIX_BASE_URL so a
 * misconfigured deployment fails loudly rather than silently billing
 * through the wrong environment's merchant. */
export function getConfiguredFinixEnvironment(): FinixEnvironment {
  const raw = (process.env.FINIX_ENVIRONMENT || "").toLowerCase();
  if (raw === "production" || raw === "sandbox") return raw;

  // Fall back to inferring from FINIX_BASE_URL only for the consistency
  // check below — never used to silently pick a merchant ID.
  const baseUrl = process.env.FINIX_BASE_URL || "";
  return baseUrl.includes("sandbox") ? "sandbox" : "production";
}

/**
 * Throws if FINIX_ENVIRONMENT was set explicitly but disagrees with what
 * FINIX_BASE_URL implies (e.g. FINIX_ENVIRONMENT=production pointed at a
 * sandbox base URL) — catches a copy-paste/deployment-config mistake
 * before it can bill a live subscription through a sandbox merchant or
 * vice versa.
 */
export function assertFinixEnvironmentConsistent(): void {
  const explicit = (process.env.FINIX_ENVIRONMENT || "").toLowerCase();
  if (explicit !== "production" && explicit !== "sandbox") return; // not set — nothing to cross-check

  const baseUrl = process.env.FINIX_BASE_URL || "";
  const baseUrlLooksSandbox = baseUrl.includes("sandbox");
  const mismatch = (explicit === "production" && baseUrlLooksSandbox) || (explicit === "sandbox" && !baseUrlLooksSandbox && baseUrl.length > 0);
  if (mismatch) {
    throw new WgcBillingConfigError(
      `FINIX_ENVIRONMENT is set to "${explicit}" but FINIX_BASE_URL ("${baseUrl}") does not match — refusing to bill until this is corrected.`,
    );
  }
}

export interface WgcBillingMerchantStatus {
  merchantId: string;
  approved: boolean;
  processingEnabled: boolean;
  rawState: string | null;
}

/**
 * Validates, against the live Finix API, that the configured WGC billing
 * merchant actually exists and is approved — called before creating a WGC
 * subscription (never on every request; this is a real API call). Fails
 * closed: any error (network, 404, malformed response) is treated as "not
 * ready," never assumed approved.
 */
export async function assertWgcBillingMerchantReady(): Promise<WgcBillingMerchantStatus> {
  assertFinixEnvironmentConsistent();
  const merchantId = getWgcBillingMerchantId();

  let merchant: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped Finix API response, matches finix/client.ts convention
  try {
    merchant = await finixClient.getMerchant(merchantId);
  } catch (err) {
    throw new WgcBillingConfigError(
      `Could not verify the configured WGC billing merchant (${merchantId}) with Finix — refusing to bill. ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const rawState: string | null = merchant?.onboarding_state ?? merchant?.status ?? null;
  const approved = rawState === "APPROVED";
  const processingEnabled = Boolean(merchant?.processing_enabled ?? approved);

  if (!approved) {
    throw new WgcBillingConfigError(
      `The configured WGC billing merchant (${merchantId}) is not in an APPROVED state with Finix (state: ${rawState ?? "unknown"}) — refusing to create or bill a subscription.`,
    );
  }

  return { merchantId, approved, processingEnabled, rawState };
}
