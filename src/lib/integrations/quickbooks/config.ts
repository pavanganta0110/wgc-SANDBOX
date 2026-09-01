import { QuickBooksConfigError } from "./errors";

// Credentials pasted into a dashboard env editor routinely pick up a
// trailing newline or a wrapping pair of quotes (same class of bug already
// hit in the Finix webhook route's normalizeSecret) — a corrupted
// client_id doesn't error loudly, it just makes Intuit's own authorize
// screen show a generic "undefined didn't connect" failure with no other
// symptom, since Intuit can't find an app matching the mangled value.
function normalizeEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  let v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1);
  }
  return v === "" ? undefined : v;
}

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
  return Boolean(normalizeEnvValue(process.env.QUICKBOOKS_CLIENT_ID) && normalizeEnvValue(process.env.QUICKBOOKS_CLIENT_SECRET));
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
  const clientId = normalizeEnvValue(process.env.QUICKBOOKS_CLIENT_ID);
  const clientSecret = normalizeEnvValue(process.env.QUICKBOOKS_CLIENT_SECRET);
  const redirectUri = normalizeEnvValue(process.env.QUICKBOOKS_REDIRECT_URI);
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

// Hardcoded fallback only — used if the discovery document fetch below
// fails (network hiccup, Intuit outage). Not overridden per-environment;
// sandbox vs. production is selected via the API base URL and the app's
// own credentials/company, not a different OAuth host.
const FALLBACK_QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const FALLBACK_QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const FALLBACK_QUICKBOOKS_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const FALLBACK_QUICKBOOKS_USERINFO_URL = "https://accounts.platform.intuit.com/v1/openid_connect/userinfo";

const QUICKBOOKS_DISCOVERY_URL = "https://developer.api.intuit.com/.well-known/openid_configuration";
const DISCOVERY_TIMEOUT_MS = 5_000;
// Same one document serves both sandbox and production — Intuit doesn't
// version this per-environment — so an in-process cache never needs
// invalidating on an environment switch; it's just avoiding a network
// round trip on every OAuth step within a process's lifetime.
const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface QuickBooksEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  userinfoUrl: string;
}

interface IntuitDiscoveryDocument {
  authorization_endpoint?: string;
  token_endpoint?: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
}

let discoveryCache: { endpoints: QuickBooksEndpoints; fetchedAt: number } | null = null;

const FALLBACK_ENDPOINTS: QuickBooksEndpoints = {
  authorizeUrl: FALLBACK_QUICKBOOKS_AUTHORIZE_URL,
  tokenUrl: FALLBACK_QUICKBOOKS_TOKEN_URL,
  revokeUrl: FALLBACK_QUICKBOOKS_REVOKE_URL,
  userinfoUrl: FALLBACK_QUICKBOOKS_USERINFO_URL,
};

/**
 * Resolves the real OAuth2/OpenID endpoints from Intuit's own discovery
 * document (per the App Assessment questionnaire's "did you use the
 * discovery document" question) rather than trusting hardcoded URLs to
 * stay correct forever. Cached in-process for DISCOVERY_CACHE_TTL_MS;
 * falls back to the last-known-good hardcoded constants (never throws)
 * if the fetch fails, is malformed, or times out — an OAuth flow must
 * never break because Intuit's discovery endpoint had a bad moment.
 */
export async function getQuickBooksEndpoints(): Promise<QuickBooksEndpoints> {
  if (discoveryCache && Date.now() - discoveryCache.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return discoveryCache.endpoints;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(QUICKBOOKS_DISCOVERY_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Discovery document request failed: ${response.status}`);
    const doc = (await response.json()) as IntuitDiscoveryDocument;
    if (!doc.authorization_endpoint || !doc.token_endpoint) {
      throw new Error("Discovery document was missing required endpoints.");
    }
    const endpoints: QuickBooksEndpoints = {
      authorizeUrl: doc.authorization_endpoint,
      tokenUrl: doc.token_endpoint,
      revokeUrl: doc.revocation_endpoint || FALLBACK_QUICKBOOKS_REVOKE_URL,
      userinfoUrl: doc.userinfo_endpoint || FALLBACK_QUICKBOOKS_USERINFO_URL,
    };
    discoveryCache = { endpoints, fetchedAt: Date.now() };
    return endpoints;
  } catch {
    // Serve the fallback but don't cache it — a transient failure should
    // be retried on the next call rather than sticking for a full TTL.
    return FALLBACK_ENDPOINTS;
  } finally {
    clearTimeout(timeout);
  }
}

export function getQuickBooksApiBaseUrl(): string {
  return getQuickBooksEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export function getQuickBooksWebhookVerifierToken(): string | null {
  const raw = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
  return raw && raw.trim() !== "" ? raw.trim() : null;
}
