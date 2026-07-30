import { getAplosApiBaseUrl } from "./config";
import { classifyAplosExceptionCode, classifyNetworkOrTimeoutError, type NormalizedAplosError } from "./errors";
import { isAplosApiException, isAplosPartnerVerification, type AplosApiEnvelope, type AplosPartnerVerification } from "./types";

/**
 * GET /partners/verify — confirmed exactly from Aplos's official docs
 * (help.aplos.com "API Calls: Partners", fetched during Checkpoint 2). This
 * is the one real, authenticated, read-only Aplos call used to prove a
 * connection actually works — see authProvider.ts's documented note on why
 * RSA decrypt success alone is never sufficient proof.
 *
 * Confirmed request shape: GET /partners/verify?api-client-id=<accountId>,
 * Authorization: Bearer <token>. Response is { authorized: boolean } — no
 * organization name or other descriptive field is returned by this
 * endpoint. This is a real, confirmed limitation of Aplos's API: WGC has no
 * documented way to fetch a human-readable organization name. Any "name" a
 * merchant sees in the WGC UI for their connection is a label THEY typed,
 * never something Aplos returned — see AplosAccountConfiguration's UI
 * copy, which must not imply otherwise.
 */
export class AplosPartnerVerifyError extends Error {
  readonly normalized: NormalizedAplosError;
  constructor(normalized: NormalizedAplosError) {
    super(normalized.safeMessage);
    this.name = "AplosPartnerVerifyError";
    this.normalized = normalized;
  }
}

export async function verifyPartnerAccess(accessToken: string, aplosAccountId: string): Promise<AplosPartnerVerification> {
  const url = `${getAplosApiBaseUrl()}/partners/verify?api-client-id=${encodeURIComponent(aplosAccountId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new AplosPartnerVerifyError(classifyNetworkOrTimeoutError("NETWORK_ERROR"));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AplosPartnerVerifyError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"));
  }

  const envelope = body as AplosApiEnvelope<{ partner_verification: AplosPartnerVerification }>;

  if (envelope && isAplosApiException(envelope.exception)) {
    throw new AplosPartnerVerifyError(classifyAplosExceptionCode(envelope.exception.code, response.status));
  }

  const verification = envelope?.data?.partner_verification;
  if (!isAplosPartnerVerification(verification)) {
    throw new AplosPartnerVerifyError(classifyNetworkOrTimeoutError("MALFORMED_RESPONSE"));
  }

  return verification;
}
