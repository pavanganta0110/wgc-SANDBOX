import { PrintfulConfigError } from "./errors";

/**
 * All Printful env vars are read lazily, fail-closed only at the point of
 * real use — matches the established pattern (see
 * src/lib/billing/wgcBillingConfig.ts, src/lib/integrations/aplos/config.ts)
 * so `next build`/typecheck never fails just because these are unset. None
 * of these are required for the app to build, deploy, or run in mock mode.
 *
 * PRINTFUL_MODE=mock (default) — MockPrintfulProvider is used everywhere,
 *   none of the credential vars below are read at all.
 * PRINTFUL_MODE=live — the real adapter is used; credentials are validated
 *   lazily the first time a merchant actually connects/syncs.
 *
 * Printful may end up issuing OAuth credentials (client id/secret + refresh
 * flow) OR a single long-lived private/store token — both shapes are
 * supported here so we don't have to touch this file again once real
 * credentials arrive; PrintfulConnection.connectionType records which one a
 * given church actually used.
 */

export type PrintfulMode = "mock" | "live";

export function getPrintfulMode(): PrintfulMode {
  const raw = (process.env.PRINTFUL_MODE || "mock").trim().toLowerCase();
  return raw === "live" ? "live" : "mock";
}

/** Global kill switch — distinct from PRINTFUL_MODE. Lets ops disable the
 * entire feature (hide nav, 404 routes) without touching mode config. */
export function isPrintfulIntegrationEnabled(): boolean {
  const raw = process.env.PRINTFUL_INTEGRATION_ENABLED;
  // Defaults to true in sandbox since this is being actively built/demoed
  // here; a production deploy of this codebase should set it explicitly.
  if (raw === undefined) return true;
  return raw.trim().toLowerCase() === "true";
}

export interface PrintfulOAuthConfig {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
}

export interface PrintfulPrivateTokenConfig {
  apiBaseUrl: string;
}

/** Throws PrintfulConfigError if OAuth vars aren't set — only called from
 * the real adapter's OAuth path, never from mock mode or module load. */
export function getPrintfulOAuthConfig(): PrintfulOAuthConfig {
  const clientId = process.env.PRINTFUL_CLIENT_ID;
  const clientSecret = process.env.PRINTFUL_CLIENT_SECRET;
  const apiBaseUrl = process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com";
  if (!clientId || !clientSecret) {
    throw new PrintfulConfigError(
      "PRINTFUL_CLIENT_ID / PRINTFUL_CLIENT_SECRET are not configured. These are only required for OAuth-based Printful connections in live mode."
    );
  }
  return { clientId, clientSecret, apiBaseUrl };
}

export function getPrintfulApiBaseUrl(): string {
  return process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com";
}

/** Only used by a legacy/global single-token setup, not the normal
 * per-merchant OAuth or per-merchant private-token flow — kept for
 * completeness per the spec's env var list, not currently read anywhere
 * else in this feature. */
export function getGlobalPrintfulAccessToken(): string | null {
  return process.env.PRINTFUL_ACCESS_TOKEN || null;
}

export function getPrintfulWebhookSecret(): string | null {
  const raw = process.env.PRINTFUL_WEBHOOK_SECRET;
  return raw && raw.trim() !== "" ? raw.trim() : null;
}
