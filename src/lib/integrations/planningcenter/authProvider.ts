import crypto from "crypto";
import {
  getPlanningCenterOAuthConfig,
  PLANNING_CENTER_AUTHORIZE_URL,
  PLANNING_CENTER_REVOKE_URL,
  PLANNING_CENTER_TOKEN_URL,
  getPlanningCenterUserAgent,
} from "./config";
import { classifyNetworkOrTimeoutError, classifyTokenEndpointError, PlanningCenterAuthError } from "./errors";

/**
 * OAuth 2.0 authorization-code + PKCE flow against Planning Center:
 *
 *   1. Redirect the church admin to /oauth/authorize with client_id, scope,
 *      redirect_uri, response_type=code, a CSRF `state`, and a PKCE
 *      code_challenge (S256).
 *   2. Planning Center redirects back with ?code=...&state=...
 *   3. POST /oauth/token (grant_type=authorization_code + code_verifier).
 *   4. Access tokens last ~2h. A refresh token is honored for ~90 days after
 *      the access token it came with was issued, and the response to a
 *      refresh carries a NEW refresh token — callers must persist it.
 *
 * Storage-agnostic like quickbooks/authProvider.ts: this module never
 * touches Prisma. Durable, race-safe refresh lives in service.ts.
 */

export interface PlanningCenterTokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  scopes: string;
}

const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const ACCESS_TOKEN_LIFETIME_SECONDS_FALLBACK = 2 * 60 * 60;
export const REFRESH_TOKEN_LIFETIME_DAYS = 90;
/** Refresh slightly before real expiry so a token never lapses mid-request. */
export const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface PlanningCenterTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  created_at?: number;
  scope?: string;
}

/** A random one-time CSRF value for the OAuth `state` parameter. */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** RFC 7636 PKCE pair: a 43+ char verifier and its S256 challenge. */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizeUrl(params: { state: string; codeChallenge: string }): string {
  const { clientId, redirectUri, scopes } = getPlanningCenterOAuthConfig();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${PLANNING_CENTER_AUTHORIZE_URL}?${query.toString()}`;
}

async function postForm(url: string, body: URLSearchParams): Promise<{ response: Response; parsed: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": getPlanningCenterUserAgent(),
      },
      body,
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { response, parsed };
  } catch {
    throw new PlanningCenterAuthError(classifyNetworkOrTimeoutError());
  } finally {
    clearTimeout(timeout);
  }
}

async function postToTokenEndpoint(body: URLSearchParams): Promise<PlanningCenterTokenSet> {
  const { response, parsed } = await postForm(PLANNING_CENTER_TOKEN_URL, body);

  if (!response.ok || !parsed || typeof parsed !== "object") {
    throw new PlanningCenterAuthError(classifyTokenEndpointError(response.status, parsed));
  }
  const data = parsed as PlanningCenterTokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new PlanningCenterAuthError(
      classifyTokenEndpointError(response.status, parsed),
      "Planning Center token response was missing an access or refresh token."
    );
  }

  // Lifetimes run from when Planning Center issued the token. Prefer its
  // `created_at`; fall back to now. Never trust a zero/negative expires_in.
  const issuedAtMs = typeof data.created_at === "number" && data.created_at > 0 ? data.created_at * 1000 : Date.now();
  const accessLifetimeSeconds = data.expires_in && data.expires_in > 0 ? data.expires_in : ACCESS_TOKEN_LIFETIME_SECONDS_FALLBACK;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: new Date(issuedAtMs + accessLifetimeSeconds * 1000),
    refreshTokenExpiresAt: new Date(issuedAtMs + REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000),
    scopes: data.scope || "",
  };
}

/** Step 3 — called once, from the OAuth callback route. */
export async function exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<PlanningCenterTokenSet> {
  const { clientId, clientSecret, redirectUri } = getPlanningCenterOAuthConfig();
  return postToTokenEndpoint(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    })
  );
}

/** The caller MUST persist the returned refreshToken, not only the access
 * token. */
export async function refreshAccessToken(refreshToken: string): Promise<PlanningCenterTokenSet> {
  const { clientId, clientSecret } = getPlanningCenterOAuthConfig();
  return postToTokenEndpoint(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })
  );
}

/**
 * Best-effort revocation on disconnect. Planning Center returns 200 even for
 * already-invalid tokens; any failure here is swallowed so a Planning Center
 * outage can never block a church from disconnecting on our side.
 * Revoking a refresh token also invalidates its access token.
 */
export async function revokeToken(token: string, tokenTypeHint: "access_token" | "refresh_token"): Promise<boolean> {
  try {
    const { clientId, clientSecret } = getPlanningCenterOAuthConfig();
    const { response } = await postForm(
      PLANNING_CENTER_REVOKE_URL,
      new URLSearchParams({ token, token_type_hint: tokenTypeHint, client_id: clientId, client_secret: clientSecret })
    );
    return response.ok;
  } catch {
    return false;
  }
}
