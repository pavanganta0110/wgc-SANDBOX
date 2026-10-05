import * as Sentry from "@sentry/nextjs";
import { generateSupportReference, redactSensitiveData, type ErrorContext } from "@/lib/utils/errorNormalizer";

/**
 * The single place every part of the app should reach for when it wants to
 * (a) tell Sentry about a technical exception with safe, structured context
 * and (b) get back a WGC-XXXXXX reference safe to show a user/merchant.
 *
 * Do not call Sentry.captureException directly outside this module — the
 * point is exactly one place decides what context shape gets attached and
 * one place redacts it, so a future "don't leak field X" fix only needs to
 * happen here (see sentryRedaction.ts for the corresponding beforeSend
 * backstop, which is why this module's own redaction is a second, cheap
 * layer, not the only one).
 *
 * Reuses ErrorContext (requestId/userId/organizationId/route/action/
 * resourceId) from errorNormalizer.ts rather than inventing a parallel
 * shape — the same context object can be threaded through
 * toSafeErrorResponse/toSafePaymentErrorResponse AND captureError for a
 * single call site that produces both the user-facing response and the
 * Sentry report.
 */
export interface CaptureOptions extends ErrorContext {
  /** Third-party system involved, e.g. "finix" | "aplos" | "resend" | "twilio" | "quickbooks" | "printful". */
  integration?: string;
  /** Free-form operation name, e.g. "refund", "webhook.process", "sync". */
  operation?: string;
  /** WGC's own operational service label (Phase 3's health-event layer owns the canonical list — kept as a plain string here, not an enum, so this module never needs to change when that list grows). */
  service?: string;
  /** Convenience alias — most call sites think in terms of "merchant", not the more generic ErrorContext.organizationId. */
  merchantId?: string;
  /** Any additional safe-ish metadata; still passed through redactSensitiveData before attaching. */
  extra?: Record<string, unknown>;
}

/**
 * Captures an exception to Sentry with safe, structured context and returns
 * a WGC-XXXXXX reference the caller can log/return to the user. Never
 * throws — a monitoring failure must never break the request it's
 * monitoring.
 */
export function captureError(error: unknown, options: CaptureOptions = {}): string {
  const reference = generateSupportReference();
  try {
    Sentry.withScope((scope) => {
      scope.setTag("wgc.reference", reference);
      if (options.requestId) scope.setTag("requestId", options.requestId);
      if (options.route) scope.setTag("route", options.route);
      if (options.integration) scope.setTag("integration", options.integration);
      if (options.operation) scope.setTag("operation", options.operation);
      if (options.service) scope.setTag("service", options.service);
      if (options.action) scope.setTag("action", options.action);

      const merchantId = options.merchantId ?? options.organizationId;
      if (merchantId) scope.setTag("merchantId", merchantId);
      if (options.userId) scope.setUser({ id: options.userId });

      const context = redactSensitiveData({
        merchantId,
        resourceId: options.resourceId,
        ...options.extra,
      });
      scope.setContext("wgc", context);

      Sentry.captureException(error);
    });
  } catch (captureFailure) {
    // Monitoring itself failing is not the caller's problem — fall back to
    // a plain console line so it's at least visible in Vercel's function
    // logs, then keep going.
    console.error("[captureError] Sentry capture failed:", captureFailure);
  }
  return reference;
}

/** For exceptions raised while calling out to a third-party integration (Aplos, QuickBooks, Printful, etc.) — anything that isn't Finix or a webhook specifically. */
export function captureIntegrationError(integration: string, error: unknown, options: Omit<CaptureOptions, "integration"> = {}): string {
  return captureError(error, { ...options, integration, service: options.service ?? integration });
}

/** For exceptions raised during a Finix payment operation (transfer, refund, recurring charge, ACH, onboarding, settlement, dispute). Only for genuine technical failures — a business decline (card declined, insufficient funds) is not an exception at all in this codebase's Finix client (see src/lib/finix/cardDeclineReasons.ts) and must never be routed through this helper. */
export function capturePaymentError(error: unknown, options: Omit<CaptureOptions, "integration"> = {}): string {
  return captureError(error, { ...options, integration: "finix", service: options.service ?? "Finix" });
}

/** For exceptions raised inside a scheduled/background job (cron routes, sync engines). */
export function captureJobError(jobName: string, error: unknown, options: CaptureOptions = {}): string {
  return captureError(error, { ...options, operation: options.operation ?? jobName, service: options.service ?? "Background Jobs" });
}

/** For exceptions raised while processing an inbound webhook. */
export function captureWebhookError(provider: string, error: unknown, options: CaptureOptions = {}): string {
  return captureError(error, { ...options, integration: provider, service: options.service ?? "Webhooks" });
}
