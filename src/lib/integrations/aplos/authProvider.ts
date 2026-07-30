import crypto from "crypto";
import { getAplosApiBaseUrl } from "./config";
import { classifyAplosExceptionCode, classifyNetworkOrTimeoutError, type NormalizedAplosError } from "./errors";
import { isAplosApiException, isAplosAuthData, type AplosApiEnvelope, type AplosAuthData } from "./types";

/**
 * Auth flow implemented exactly per Aplos's official documentation
 * (help.aplos.com "API: Authentication", fetched during Checkpoint 2):
 *
 *   1. GET https://app.aplos.com/hermes/api/v1/auth/:clientId  (no params)
 *   2. Response: { version, status, data: { expires, token } } — token is
 *      base64, RSA/PKCS1Padding-encrypted with the org's public key.
 *   3. Decrypt using the org's PKCS8 private key: RSA/ECB/PKCS1Padding.
 *   4. Token expires 30 minutes after issue (data.expires is the
 *      authoritative timestamp — never assume a fixed offset).
 *   5. Request a new token the same way whenever the current one expires.
 *      Aplos's own guidance: requesting more than once per 30 minutes risks
 *      the account being flagged for abuse — never poll for a fresh token
 *      faster than that.
 *
 * UNVERIFIED (flagged, not guessed): Aplos's documentation shows their
 * private-key file loaded as raw base64 PKCS8 DER (no PEM headers) in their
 * own Java example, but does not show what format keys generated via the
 * Aplos dashboard today actually download as — a modern download may well
 * be PEM-wrapped. loadPrivateKey() below accepts either, but which one a
 * real Aplos-issued key actually is has not been confirmed against a live
 * account. This must be verified against real pilot credentials before
 * being called production-ready (see docs/integrations/aplos.md "Pilot
 * Verification Checklist").
 */

export interface AplosCredentials {
  clientId: string;
  /** Decrypted, PEM or raw-base64-PKCS8 private key material. Caller is
   * responsible for decryption (see credentials.ts) — this module never
   * touches AplosConnection.encryptedPrivateKey directly, keeping the auth
   * provider storage-agnostic per the partner-authorization compatibility
   * requirement (a future OAuthPartnerAuthProvider implements the same
   * interface without ever handling a private key at all). */
  privateKeyMaterial: string;
}

export interface AplosAccessToken {
  token: string;
  expiresAt: Date;
}

/**
 * Storage-agnostic authentication interface. AplosApiClient and every
 * service above it depend on this, never on ManualCredentialAuthProvider
 * directly, so a future official-partner OAuth flow can implement the same
 * interface (getAccessToken/invalidate) and be swapped in without touching
 * AplosContributionBuilder, AplosSettlementSyncService, mapping, retry, or
 * any UI.
 */
export interface AplosAuthenticationProvider {
  /** Returns a valid, non-expired access token for the church's connected
   * Aplos organization — from cache if still valid, otherwise fetches and
   * decrypts a fresh one. Concurrent calls for the same churchId must never
   * trigger more than one in-flight token request (single-flight). */
  getAccessToken(churchId: string): Promise<AplosAccessToken>;
  /** Clears any cached token for this church — called on disconnect, and
   * whenever a request comes back ACCESS_DENIED/invalid-credentials so a
   * stale cached token is never reused. */
  invalidate(churchId: string): void;
}

export class AplosAuthError extends Error {
  readonly normalized: NormalizedAplosError;
  constructor(normalized: NormalizedAplosError, message?: string) {
    super(message ?? normalized.safeMessage);
    this.name = "AplosAuthError";
    this.normalized = normalized;
  }
}

/** Refresh this long before actual expiry so a token never expires
 * mid-request — 30-minute tokens, 60-second buffer is generous relative to
 * how long a single sync attempt takes. */
const EXPIRY_BUFFER_MS = 60_000;

/**
 * Loads an Aplos private key for RSA decryption. Accepts either a
 * PEM-formatted key (`-----BEGIN PRIVATE KEY-----...`) or raw base64 PKCS8
 * DER (matching Aplos's own documented Java example, which reads a key file
 * with no PEM headers) — see the UNVERIFIED note above for why both are
 * supported rather than assuming one.
 */
function loadPrivateKey(material: string): crypto.KeyObject {
  const trimmed = material.trim();
  if (trimmed.includes("-----BEGIN")) {
    return crypto.createPrivateKey({ key: trimmed, format: "pem" });
  }
  const der = Buffer.from(trimmed, "base64");
  return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

/**
 * Decrypts an Aplos access token. Algorithm confirmed exactly from Aplos's
 * documented Java example: RSA/ECB/PKCS1Padding — Node's equivalent is
 * crypto.privateDecrypt with RSA_PKCS1_PADDING.
 *
 * Exported standalone (not just used internally) so it can be unit-tested
 * against a locally generated RSA keypair without any live Aplos call —
 * see __tests__/authProvider.test.ts.
 *
 * IMPORTANT, confirmed by that test suite: decrypting with the WRONG private
 * key does not throw. Modern OpenSSL uses "implicit rejection" for RSA-PKCS1
 * decryption (a Bleichenbacher-attack countermeasure) — a wrong key silently
 * produces deterministic garbage bytes instead of an error, specifically so
 * a padding-failure side channel can't be exploited. This means a wrong
 * private key is NOT detected here; it only surfaces one step later, when
 * the garbage "token" is used as a Bearer credential against a real Aplos
 * endpoint and Aplos rejects it. Consequence for a future checkpoint: "Test
 * Connection" must make one real authenticated API call (e.g. GET
 * /partners/verify) to prove the key is actually correct — a decrypt that
 * merely "succeeds" without throwing is not sufficient proof.
 */
export function decryptAccessToken(encryptedTokenBase64: string, privateKeyMaterial: string): string {
  const key = loadPrivateKey(privateKeyMaterial);
  const encrypted = Buffer.from(encryptedTokenBase64, "base64");
  try {
    const decrypted = crypto.privateDecrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, encrypted);
    return decrypted.toString("utf8");
  } catch {
    // Never leak the underlying OpenSSL error (padding/format details) —
    // this always means either the wrong private key or a malformed token.
    throw new AplosAuthError(
      { category: "AUTHENTICATION_REQUIRED", retryable: false, safeMessage: "Could not decrypt the Aplos access token with the connected private key." }
    );
  }
}

async function requestEncryptedToken(clientId: string): Promise<AplosAuthData> {
  const url = `${getAplosApiBaseUrl()}/auth/${encodeURIComponent(clientId)}`;
  let response: Response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch {
    throw new AplosAuthError(classifyNetworkOrTimeoutError("NETWORK_ERROR"));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AplosAuthError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"));
  }

  const envelope = body as AplosApiEnvelope<AplosAuthData>;

  if (envelope && isAplosApiException(envelope.exception)) {
    // The normalized, safe message from classifyAplosExceptionCode is used
    // (not envelope.exception.message) — Aplos's raw exception text is
    // never surfaced past this point, per the "must not reveal sensitive
    // details" requirement.
    throw new AplosAuthError(classifyAplosExceptionCode(envelope.exception.code, response.status));
  }

  if (!response.ok || !envelope || !isAplosAuthData(envelope.data)) {
    throw new AplosAuthError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"));
  }

  return envelope.data;
}

interface CachedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Implements AplosAuthenticationProvider for the current (non-partner)
 * manual-credential connection model: each church supplies its own Aplos
 * client id + private key once, this provider requests and decrypts tokens
 * on their behalf going forward.
 *
 * Caching is in-memory and per-process — this codebase has no durable
 * cross-instance cache (no Redis/Upstash present; confirmed during the
 * Checkpoint 1 audit), and Vercel's serverless model means this cache does
 * not reliably persist between invocations. The correctness guarantee this
 * class actually provides is: (a) never issuing a second concurrent token
 * request for the same church within one process via the single-flight
 * lock, and (b) never using a token past its documented 30-minute
 * expiration. It is NOT a guarantee of minimizing total token requests
 * across a serverless fleet — that would need durable shared cache
 * infrastructure this codebase does not have today, and adding one is out
 * of Checkpoint 2's approved scope.
 */
export class ManualCredentialAuthProvider implements AplosAuthenticationProvider {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inFlight = new Map<string, Promise<AplosAccessToken>>();

  constructor(private readonly resolveCredentials: (churchId: string) => Promise<AplosCredentials>) {}

  async getAccessToken(churchId: string): Promise<AplosAccessToken> {
    const cached = this.cache.get(churchId);
    if (cached && cached.expiresAt.getTime() - EXPIRY_BUFFER_MS > Date.now()) {
      return cached;
    }

    const existing = this.inFlight.get(churchId);
    if (existing) return existing;

    const request = this.fetchAndCacheToken(churchId).finally(() => {
      this.inFlight.delete(churchId);
    });
    this.inFlight.set(churchId, request);
    return request;
  }

  invalidate(churchId: string): void {
    this.cache.delete(churchId);
    this.inFlight.delete(churchId);
  }

  private async fetchAndCacheToken(churchId: string): Promise<AplosAccessToken> {
    const credentials = await this.resolveCredentials(churchId);
    const authData = await requestEncryptedToken(credentials.clientId);
    const token = decryptAccessToken(authData.token, credentials.privateKeyMaterial);
    const expiresAt = new Date(authData.expires);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new AplosAuthError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"), "Aplos returned an unparseable token expiration.");
    }

    const result: AplosAccessToken = { token, expiresAt };
    this.cache.set(churchId, result);
    return result;
  }
}
