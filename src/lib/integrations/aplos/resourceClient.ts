import { getAplosApiBaseUrl } from "./config";
import { classifyAplosExceptionCode, classifyNetworkOrTimeoutError, type NormalizedAplosError } from "./errors";
import { isAplosApiException, type AplosApiEnvelope } from "./types";

/**
 * Low-level authenticated GET client shared by purposes.ts, accounts.ts,
 * and funds.ts — all three Aplos resources documented as read-only GET
 * /list endpoints (POST/PUT/DELETE on accounts and funds confirmed to
 * return 405 "not available" in official docs; purposes technically
 * supports POST/PUT/DELETE but this integration never calls them — see
 * docs/integrations/aplos.md "Account eligibility" for why WGC never
 * creates Aplos resources).
 *
 * Every call is a real, authenticated, timed-out HTTP request — never
 * fabricated. Aplos's docs specify no timeout of their own, so a
 * conservative client-side timeout is applied defensively (documented as
 * our own choice, not an Aplos-documented value).
 */

const REQUEST_TIMEOUT_MS = 15_000;

export class AplosResourceError extends Error {
  readonly normalized: NormalizedAplosError;
  constructor(normalized: NormalizedAplosError) {
    super(normalized.safeMessage);
    this.name = "AplosResourceError";
    this.normalized = normalized;
  }
}

/**
 * Performs one authenticated GET against the Aplos API. `aplosAccountId`
 * maps to the documented `aplos-account-id` header ("The Aplos account
 * (organization) you are accessing (OPTIONAL)" per every List/Get endpoint
 * doc) — included whenever a specific organization context is known, since
 * a client id can have access to multiple Aplos organizations.
 *
 * Never logs the Authorization header or the full raw response body — only
 * safe, normalized error information ever leaves this function on failure.
 */
export async function aplosAuthenticatedGet<T>(
  path: string,
  accessToken: string,
  aplosAccountId: string | undefined,
  searchParams?: Record<string, string>
): Promise<AplosApiEnvelope<T>> {
  const url = new URL(`${getAplosApiBaseUrl()}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (aplosAccountId) headers["aplos-account-id"] = aplosAccountId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: "GET", headers, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // A GET that never sent a body has no duplicate-write risk — safe to
      // classify as a plain network/temporary failure, not AMBIGUOUS_RESULT
      // (that distinction only matters for a POST that may have reached
      // Aplos before the connection dropped).
      throw new AplosResourceError(classifyNetworkOrTimeoutError("NETWORK_ERROR"));
    }
    throw new AplosResourceError(classifyNetworkOrTimeoutError("NETWORK_ERROR"));
  } finally {
    clearTimeout(timeout);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AplosResourceError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"));
  }

  const envelope = body as AplosApiEnvelope<T>;
  if (envelope && isAplosApiException(envelope.exception)) {
    throw new AplosResourceError(classifyAplosExceptionCode(envelope.exception.code, response.status));
  }
  if (!response.ok) {
    throw new AplosResourceError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"));
  }

  return envelope;
}
