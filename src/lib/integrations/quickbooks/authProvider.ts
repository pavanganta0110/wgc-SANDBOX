import { getQuickBooksEndpoints, getQuickBooksOAuthConfig } from "./config";
import { classifyNetworkOrTimeoutError, classifyTokenEndpointError, QuickBooksConnectionError, type NormalizedQuickBooksError } from "./errors";

/**
 * OAuth2 authorization-code + refresh-token flow implemented per Intuit's
 * documented "OAuth 2.0 Playground" / developer.intuit.com flow:
 *
 *   1. Authorize: redirect the merchant to the authorize endpoint (resolved
 *      from Intuit's own OpenID discovery document — see
 *      getQuickBooksEndpoints() in config.ts, not a hardcoded URL) with
 *      client_id, scope, redirect_uri, response_type=code, and a per-request
 *      `state` value (CSRF token) — see route.ts's connect/authorize route.
 *   2. Intuit redirects back to redirect_uri with ?code=...&realmId=...&state=...
 *   3. Exchange the code for tokens: POST the discovery-resolved token
 *      endpoint with grant_type=authorization_code, HTTP Basic auth
 *      (clientId:clientSecret).
 *   4. Access tokens expire in ~1 hour; refresh tokens rotate on every use
 *      and expire after ~100 days of inactivity — a fresh refresh_token
 *      must be persisted every time it's used, or the connection is lost.
 *
 * This module intentionally never touches Prisma directly — it is
 * storage-agnostic like AplosAuthenticationProvider, taking
 * resolve/persist callbacks so the connection-service layer owns all DB
 * access.
 */

export interface QuickBooksTokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  scopes: string;
}

export class QuickBooksAuthError extends Error {
  readonly normalized: NormalizedQuickBooksError;
  constructor(normalized: NormalizedQuickBooksError, message?: string) {
    super(message ?? normalized.safeMessage);
    this.name = "QuickBooksAuthError";
    this.normalized = normalized;
  }
}

const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
// Access tokens are documented at ~3600s — refresh well before actual
// expiry so a token never expires mid-request.
const EXPIRY_BUFFER_MS = 60_000;
const ACCESS_TOKEN_LIFETIME_SECONDS_FALLBACK = 3600;
const REFRESH_TOKEN_LIFETIME_DAYS = 100;

interface IntuitTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  scope?: string;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function postToTokenEndpoint(body: URLSearchParams): Promise<QuickBooksTokenSet> {
  const { clientId, clientSecret } = getQuickBooksOAuthConfig();
  const { tokenUrl } = await getQuickBooksEndpoints();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });
  } catch {
    throw new QuickBooksAuthError(classifyNetworkOrTimeoutError());
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  // Intuit support asks for this on every ticket — captured on every
  // failed token-endpoint request regardless of which branch below fires.
  const intuitTid = response.headers.get("intuit_tid") ?? undefined;

  if (!response.ok || !parsed || typeof parsed !== "object") {
    throw new QuickBooksAuthError({ ...classifyTokenEndpointError(response.status, parsed), intuitTid });
  }

  const data = parsed as IntuitTokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new QuickBooksAuthError(
      { ...classifyTokenEndpointError(response.status, parsed), intuitTid },
      "QuickBooks token response was missing an access or refresh token."
    );
  }

  const now = Date.now();
  const accessLifetimeSeconds = data.expires_in && data.expires_in > 0 ? data.expires_in : ACCESS_TOKEN_LIFETIME_SECONDS_FALLBACK;
  const refreshLifetimeSeconds = data.x_refresh_token_expires_in && data.x_refresh_token_expires_in > 0
    ? data.x_refresh_token_expires_in
    : REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: new Date(now + accessLifetimeSeconds * 1000),
    refreshTokenExpiresAt: new Date(now + refreshLifetimeSeconds * 1000),
    scopes: data.scope || "",
  };
}

/** Step 3 of the flow above — called once, from the OAuth callback route,
 * with the authorization `code` Intuit just redirected back with. */
export async function exchangeAuthorizationCode(code: string): Promise<QuickBooksTokenSet> {
  const { redirectUri } = getQuickBooksOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  return postToTokenEndpoint(body);
}

/** Refreshes an access token using a still-valid refresh token. Intuit
 * rotates the refresh token on every call — the caller MUST persist the
 * returned refreshToken, not just the accessToken, or the next refresh
 * will fail with an invalid_grant error. */
export async function refreshAccessToken(refreshToken: string): Promise<QuickBooksTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToTokenEndpoint(body);
}

export interface QuickBooksAccessToken {
  token: string;
  realmId: string;
  expiresAt: Date;
}

export interface QuickBooksStoredCredentials {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

/**
 * Storage-agnostic authentication interface, mirroring
 * AplosAuthenticationProvider's shape. The connection service supplies
 * resolveCredentials (decrypt the currently-stored tokens for a church) and
 * persistRefreshed (re-encrypt and save a rotated token pair) — this class
 * never imports Prisma or the encryption module directly.
 */
export interface QuickBooksAuthenticationProvider {
  getAccessToken(churchId: string): Promise<QuickBooksAccessToken>;
  invalidate(churchId: string): void;
}

interface CachedToken {
  token: string;
  realmId: string;
  expiresAt: Date;
}

export class OAuthQuickBooksAuthProvider implements QuickBooksAuthenticationProvider {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inFlight = new Map<string, Promise<QuickBooksAccessToken>>();

  constructor(
    private readonly resolveCredentials: (churchId: string) => Promise<QuickBooksStoredCredentials>,
    private readonly persistRefreshed: (churchId: string, tokens: QuickBooksTokenSet) => Promise<void>
  ) {}

  async getAccessToken(churchId: string): Promise<QuickBooksAccessToken> {
    const cached = this.cache.get(churchId);
    if (cached && cached.expiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now()) {
      return cached;
    }

    const existing = this.inFlight.get(churchId);
    if (existing) return existing;

    const request = this.refreshAndCache(churchId).finally(() => {
      this.inFlight.delete(churchId);
    });
    this.inFlight.set(churchId, request);
    return request;
  }

  invalidate(churchId: string): void {
    this.cache.delete(churchId);
    this.inFlight.delete(churchId);
  }

  private async refreshAndCache(churchId: string): Promise<QuickBooksAccessToken> {
    const stored = await this.resolveCredentials(churchId);

    // Still valid (e.g. warm process cache was dropped but the stored
    // token itself hasn't expired yet) — use it without a network call.
    if (stored.accessTokenExpiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now()) {
      const result: QuickBooksAccessToken = { token: stored.accessToken, realmId: stored.realmId, expiresAt: stored.accessTokenExpiresAt };
      this.cache.set(churchId, result);
      return result;
    }

    if (!stored.refreshToken) {
      throw new QuickBooksConnectionError("This organization's QuickBooks connection has no refresh token on file. Reconnect QuickBooks.");
    }

    const refreshed = await refreshAccessToken(stored.refreshToken);
    await this.persistRefreshed(churchId, refreshed);

    const result: QuickBooksAccessToken = { token: refreshed.accessToken, realmId: stored.realmId, expiresAt: refreshed.accessTokenExpiresAt };
    this.cache.set(churchId, result);
    return result;
  }
}
