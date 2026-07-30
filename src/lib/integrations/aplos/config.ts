/**
 * Aplos environment configuration. Kept minimal per the approved spec —
 * only server-only variables, never NEXT_PUBLIC_*. Merchant-specific
 * credentials (client id, private key) are never environment variables;
 * they live in encrypted, church-scoped AplosConnection rows (see
 * credentials.ts).
 */

/**
 * https://app.aplos.com/hermes/api/v1 — confirmed directly from Aplos's
 * official documentation (every endpoint fetched during Checkpoint 2 shares
 * this exact prefix). Overridable via APLOS_API_BASE_URL for
 * sandbox/test-double use in integration tests, since Aplos has no
 * separate documented sandbox host of its own.
 */
const DEFAULT_APLOS_API_BASE_URL = "https://app.aplos.com/hermes/api/v1";

export function getAplosApiBaseUrl(): string {
  const configured = process.env.APLOS_API_BASE_URL;
  return configured && configured.trim() !== "" ? configured.trim().replace(/\/+$/, "") : DEFAULT_APLOS_API_BASE_URL;
}

/**
 * Master automatic-sync kill switch, independent of any single
 * AplosConnection.automaticSyncEnabled — lets the cron be disabled platform-
 * wide (e.g. during an incident) without touching every organization's row.
 * Defaults to disabled: sync only runs where this is explicitly "true".
 */
export function isAplosSyncGloballyEnabled(): boolean {
  return process.env.APLOS_SYNC_ENABLED === "true";
}
