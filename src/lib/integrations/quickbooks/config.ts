import { QuickBooksConfigError } from "./errors";

/**
 * All QuickBooks env vars are read lazily, fail-closed only at the point of
 * real use — same pattern as src/lib/integrations/aplos/config.ts and
 * src/lib/integrations/printful/config.ts, so `next build`/typecheck never
 * fails just because these are unset. None of these are required for the
 * app to build, deploy, or run with the integration disabled.
 *
 * Unlike Aplos/Printful, QuickBooks has no "mock" or "private token" mode —
 * Intuit only supports OAuth2 authorization-code + refresh-token flow, so
 * QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET must be a real Intuit
 * Developer app's credentials before any connect attempt will succeed.
 * Until they're set, isQuickBooksIntegrationConfigured() returns false and
 * the UI shows a "not yet configured" state rather than a broken button.
 */

export type QuickBooksEnvironment = "sandbox" | "production";

export function getQuickBooksEnvironment(): QuickBooksEnvironment {
  const raw = (process.env.QUICKBOOKS_ENVIRONMENT || "sandbox").trim().toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

/** Global kill switch — lets ops hide the integration entirely without
 * touching credential env vars. Defaults to true in this sandbox repo
 * since the feature is being actively built/demoed here. */
export function isQuickBooksIntegrationEnabled(): boolean {
  const raw = process.env.QUICKBOOKS_INTEGRATION_ENABLED;
  if (raw === undefined) return true;
  return raw.trim().toLowerCase() === "true";
}

/** True once real Intuit Developer app credentials are present — the UI
 * uses this to distinguish "not configured yet" from "configured but not
 * connected for this org" without ever throwing. */
export function isQuickBooksIntegrationConfigured(): boolean {
  return Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);
}

export interface QuickBooksOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: QuickBooksEnvironment;
  /** Space-delimited OAuth scopes requested at authorize time. */
  scopes: string;
}

/** Throws QuickBooksConfigError if OAuth vars aren't set — only called from
 * the real authorize/token-exchange path, never from module load or a
 * status/read-only route. */
export function getQuickBooksOAuthConfig(): QuickBooksOAuthConfig {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new QuickBooksConfigError(
      "QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET / QUICKBOOKS_REDIRECT_URI are not configured. Register an app at developer.intuit.com and set these as server-only environment variables."
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    environment: getQuickBooksEnvironment(),
    scopes: process.env.QUICKBOOKS_SCOPES || "com.intuit.quickbooks.accounting",
  };
}

// Fixed Intuit endpoints — never overridden per-environment; sandbox vs.
// production is selected via the API base URL and the app's own
// credentials/company, not a different OAuth host.
export const QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QUICKBOOKS_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
export const QUICKBOOKS_USERINFO_URL = "https://accounts.platform.intuit.com/v1/openid_connect/userinfo";

export function getQuickBooksApiBaseUrl(): string {
  return getQuickBooksEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export function getQuickBooksWebhookVerifierToken(): string | null {
  const raw = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
  return raw && raw.trim() !== "" ? raw.trim() : null;
}
