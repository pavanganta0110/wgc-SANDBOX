import { recordHealthEvent } from "./healthEvents";

/**
 * Twilio technical-failure classification — called from
 * src/lib/sms/authSmsSender.ts, the centralized 2FA/auth SMS send path.
 * Reuses AuthSmsSendLog as the primary delivery-status source (per "reuse
 * the existing log, don't duplicate"); this only adds a System Health
 * signal for genuine provider/technical problems, kept separate from a
 * recipient-specific outcome (bad number, opted out, unreachable handset).
 *
 * Twilio error codes are shared between the synchronous send-attempt
 * response AND the async delivery-status webhook callback
 * (/api/webhooks/twilio/auth-status, which updates AuthSmsSendLog.errorCode)
 * — this module's recipient-specific code list is exported so
 * serviceStatus.ts's twilioStatus() can apply the identical classification
 * to codes that arrive later via that callback, not just synchronous ones.
 *
 * Context is deliberately kept separate for 2FA/auth vs donor messaging vs
 * future RCS per the design doc — this module is the 2FA-specific one,
 * matching authSmsSender.ts's own scope; a donor-messaging equivalent would
 * be its own module the day sendText.ts's hard-disable is ever lifted.
 */

export type TwilioFailureKind = "CONFIG_MISSING" | "AUTH_FAILURE" | "RATE_LIMITED" | "PROVIDER_ERROR" | "NETWORK_ERROR" | "UNKNOWN_TECHNICAL";

/**
 * Twilio error codes that mean "this specific number/recipient can't
 * receive this message" rather than "Twilio itself is having a problem" —
 * kept intentionally short and conservative (only well-documented codes)
 * rather than exhaustive; anything not on this list defaults to
 * counted-as-technical, the safer direction to be wrong in for a
 * monitoring signal.
 */
export const TWILIO_RECIPIENT_SPECIFIC_ERROR_CODES = new Set([
  "21211", // Invalid 'To' Phone Number
  "21214", // 'To' phone number cannot be reached
  "21610", // Recipient unsubscribed (opted out)
  "21614", // 'To' number is not a valid mobile number
  "30003", // Unreachable destination handset
  "30005", // Unknown destination handset
  "30006", // Landline or unreachable carrier
]);

export function isRecipientSpecificTwilioError(errorCode: string | null | undefined): boolean {
  return !!errorCode && TWILIO_RECIPIENT_SPECIFIC_ERROR_CODES.has(errorCode);
}

/** Returns null when the failure is a normal recipient-specific outcome that must NOT be recorded as a System Health event. */
export function classifyTwilioFailure(params: { httpStatus: number | null; twilioErrorCode?: string; wasException: boolean }): { kind: TwilioFailureKind; severity: "WARNING" | "ERROR" | "CRITICAL" } | null {
  if (params.wasException) return { kind: "NETWORK_ERROR", severity: "ERROR" };
  if (isRecipientSpecificTwilioError(params.twilioErrorCode)) return null;
  if (params.httpStatus === 401 || params.httpStatus === 403) return { kind: "AUTH_FAILURE", severity: "CRITICAL" };
  if (params.httpStatus === 429) return { kind: "RATE_LIMITED", severity: "WARNING" };
  if (params.httpStatus != null && params.httpStatus >= 500) return { kind: "PROVIDER_ERROR", severity: "CRITICAL" };
  return { kind: "UNKNOWN_TECHNICAL", severity: "ERROR" };
}

export function recordTwilioTechnicalFailure(params: { httpStatus: number | null; twilioErrorCode?: string; wasException: boolean; message: string; userId?: string; context?: string }): void {
  const classification = classifyTwilioFailure({ httpStatus: params.httpStatus, twilioErrorCode: params.twilioErrorCode, wasException: params.wasException });
  if (!classification) return;

  void recordHealthEvent({
    service: "Twilio",
    integration: "twilio",
    operation: params.context ?? "auth_sms",
    status: "FAILED",
    severity: classification.severity,
    userId: params.userId,
    errorCode: params.twilioErrorCode,
    message: params.message,
    metadata: { kind: classification.kind, httpStatus: params.httpStatus },
  }).catch((err) => {
    console.error("[recordTwilioTechnicalFailure] failed to record health event:", err);
  });
}

export function recordTwilioConfigMissing(context: string): void {
  void recordHealthEvent({
    service: "Twilio",
    integration: "twilio",
    operation: context,
    status: "FAILED",
    severity: "CRITICAL",
    message: `Twilio is not configured for ${context}`,
    metadata: { kind: "CONFIG_MISSING" satisfies TwilioFailureKind },
  }).catch((err) => {
    console.error("[recordTwilioConfigMissing] failed to record health event:", err);
  });
}
