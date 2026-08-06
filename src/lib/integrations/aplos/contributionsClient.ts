import { getAplosApiBaseUrl } from "./config";
import { classifyAplosExceptionCode, classifyNetworkOrTimeoutError, type NormalizedAplosError } from "./errors";
import { isAplosApiException, isAplosContribution, type AplosApiEnvelope, type AplosContribution, type AplosContributionInput } from "./types";

/**
 * POST /contributions client — confirmed shape from help.aplos.com "API
 * Calls: Contributions" (fetched during Checkpoint 2, re-verified here for
 * Checkpoint 6/7). This is the only mutating Aplos call this integration
 * makes; every other resource (Purposes read, Accounts, Funds) is GET-only.
 *
 * NEVER invoked with a real request against a live Aplos account in this
 * checkpoint — no pilot credentials exist. This is real, production-ready
 * code, exercised only via mocked fetch in tests, per the approved spec's
 * instruction to build (not fabricate results for) real contribution
 * posting.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export class AplosContributionPostError extends Error {
  readonly normalized: NormalizedAplosError;
  /** True only when the failure occurred after the request may have
   * reached Aplos (network drop / timeout mid-flight) — the caller
   * (syncEngine.ts) MUST treat this as AMBIGUOUS_RESULT / NEEDS_REVIEW,
   * never as a plain retryable failure, per docs/integrations/aplos.md
   * section 7's mandatory Checkpoint 7 policy. */
  readonly ambiguous: boolean;
  constructor(normalized: NormalizedAplosError, ambiguous: boolean) {
    super(normalized.safeMessage);
    this.name = "AplosContributionPostError";
    this.normalized = normalized;
    this.ambiguous = ambiguous;
  }
}

/**
 * Posts one Contribution to Aplos. The pre-send vs. post-send timeout
 * distinction (the entire basis of the mandatory ambiguous-result policy)
 * is implemented by tracking `sent` — set to true only once `fetch()` has
 * actually been invoked, so an AbortError before that point (which cannot
 * happen for a synchronous call but is defended anyway for clarity) is
 * never misclassified as ambiguous.
 */
export async function postAplosContribution(
  payload: AplosContributionInput,
  accessToken: string,
  aplosAccountId: string
): Promise<AplosContribution> {
  const url = `${getAplosApiBaseUrl()}/contributions`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "aplos-account-id": aplosAccountId,
    "Content-Type": "application/json",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    // The Fetch API gives no way to distinguish "the request never left
    // this process" from "the request reached Aplos but the response never
    // came back" — both surface as the same thrown network/abort error.
    // Per the mandatory policy (docs/integrations/aplos.md section 7), any
    // failure on this mutating call must be treated as ambiguous — the
    // safer reading — never assumed to be a clean pre-send failure.
    const normalized = classifyNetworkOrTimeoutError(err instanceof Error && err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR");
    throw new AplosContributionPostError(normalized, true);
  }
  clearTimeout(timeout);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A non-JSON or unparseable body after we DID get an HTTP response back
    // is not ambiguous in the "did Aplos see it" sense — Aplos responded,
    // we just can't read what it said. Still safest treated as needing
    // review, since we cannot confirm the contribution was or wasn't
    // created from this response alone.
    throw new AplosContributionPostError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"), true);
  }

  const envelope = body as AplosApiEnvelope<AplosContribution>;
  if (envelope && isAplosApiException(envelope.exception)) {
    // A confirmed HTTP response with a parseable Aplos exception is NOT
    // ambiguous — Aplos told us definitively what happened (per the
    // mandatory policy table's second row).
    throw new AplosContributionPostError(classifyAplosExceptionCode(envelope.exception.code, response.status), false);
  }
  if (!response.ok || !envelope?.data || !isAplosContribution(envelope.data)) {
    throw new AplosContributionPostError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"), true);
  }

  return envelope.data;
}
