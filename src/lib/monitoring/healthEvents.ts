import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redactSensitiveData, generateSupportReference } from "@/lib/utils/errorNormalizer";

/**
 * Server-only. WGC's own operational health-event layer (Layer 2 — see
 * captureError.ts's doc comment for how this differs from Sentry/Layer 1).
 * This is the exact recordHealthEvent() shape from the System Health design
 * doc — the stable API every future producer (Finix, Supabase, Resend,
 * Twilio, Aplos, webhooks, background jobs — Phase 3+) calls into, and the
 * only thing the System Health admin pages ever need to read from. A new
 * producer never requires a UI or schema change: it just calls this with
 * its own `service` string.
 *
 * Deliberately NOT imported by src/lib/monitoring/captureError.ts, which
 * must stay usable from client components (React error boundaries) — this
 * module imports the Prisma client and can only run server-side. The two
 * are complementary, not layered on top of each other: a server-side call
 * site that wants both a Sentry report AND a WGC health event calls
 * captureError() and recordHealthEvent() separately (see
 * src/instrumentation.ts's onRequestError for the one place Phase 2 does
 * this today).
 *
 * Only ever called for a *meaningful* occurrence (a failure, a recovery, a
 * real warning) — never for every successful request. See the "do not
 * create millions of rows" requirement this was designed against.
 */

export type HealthEventStatus = "SUCCESS" | "WARNING" | "FAILED" | "RECOVERED";
export type HealthEventSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface RecordHealthEventParams {
  /** Canonical service name — "WGC API" | "Supabase" | "Finix" | "Resend" | "Twilio" | "Aplos" | "Webhooks" | "Background Jobs", or a future addition. Not an enum on purpose — see schema comment. */
  service: string;
  operation?: string;
  /** Third-party system involved, when distinct from `service` (e.g. service="Webhooks", integration="finix"). */
  integration?: string;
  route?: string;
  status: HealthEventStatus;
  severity: HealthEventSeverity;
  merchantId?: string;
  userId?: string;
  requestId?: string;
  /** An external system's own id for this operation (a Finix transfer id, an Aplos sync record id) — never a payment instrument/card/bank account identifier. */
  externalId?: string;
  /** A provider-issued error/failure code (a Finix error code, a Twilio error code, an Aplos exception code), when available — a precise grouping signal, preferred over fuzzy message-matching when present. Stored in metadata, not a dedicated column, since its shape varies per provider. */
  errorCode?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Stable hash grouping "the same underlying problem" together. Prefers a
 * provider error code when one is available (precise — two different
 * messages with the same Finix/Twilio code are genuinely the same failure
 * type) and falls back to a normalized, digit-stripped message shape
 * otherwise ("timeout after 12000ms" and "timeout after 8000ms" group
 * together). Always includes service + integration + operation + route so
 * unrelated errors that merely LOOK similar in text never collide — e.g. a
 * Finix timeout on /transfers and a Finix timeout on /subscriptions stay in
 * separate groups because their operation differs.
 */
function buildErrorFingerprint(params: Pick<RecordHealthEventParams, "service" | "integration" | "operation" | "route" | "message" | "errorCode">): string {
  const messageOrCode =
    params.errorCode ??
    params.message
      .toLowerCase()
      .replace(/[0-9]+/g, "#")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  const key = [params.service, params.integration ?? "", params.operation ?? "", params.route ?? "", messageOrCode].join("|");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export interface RecordHealthEventResult {
  eventId: string;
  wgcReference: string;
}

/**
 * Records one operational occurrence, and — for ERROR/CRITICAL severity —
 * upserts the aggregated SystemErrorGroup it belongs to (incrementing
 * occurrenceCount / bumping lastSeenAt on a repeat, creating it on the
 * first). Never throws: a monitoring write failing must never break the
 * operation it's monitoring. Returns the created event's id and a fresh
 * WGC-XXXXXX reference, or null if the write itself failed.
 */
export async function recordHealthEvent(params: RecordHealthEventParams): Promise<RecordHealthEventResult | null> {
  try {
    const safeMessage = String(redactSensitiveData(params.message));
    const safeMetadata = params.metadata ? (redactSensitiveData(params.metadata) as unknown as Prisma.InputJsonValue) : undefined;

    let errorGroupId: string | undefined;
    if (params.severity === "ERROR" || params.severity === "CRITICAL") {
      const fingerprint = buildErrorFingerprint({
        service: params.service,
        integration: params.integration,
        operation: params.operation,
        route: params.route,
        message: safeMessage,
        errorCode: params.errorCode,
      });
      const group = await prisma.systemErrorGroup.upsert({
        where: { fingerprint },
        create: {
          fingerprint,
          service: params.service,
          integration: params.integration,
          route: params.route,
          severity: params.severity,
          message: safeMessage,
        },
        update: {
          lastSeenAt: new Date(),
          occurrenceCount: { increment: 1 },
          message: safeMessage,
          // A repeat occurrence at CRITICAL should be able to raise an
          // already-OPEN group's severity, but never silently downgrade a
          // CRITICAL group back to ERROR from a less-severe repeat.
          severity: params.severity === "CRITICAL" ? "CRITICAL" : undefined,
        },
      });
      errorGroupId = group.id;
    }

    const wgcReference = generateSupportReference();
    const metadataWithErrorCode =
      params.errorCode != null
        ? ({ ...(safeMetadata as Record<string, unknown> | undefined), errorCode: params.errorCode } as unknown as Prisma.InputJsonValue)
        : safeMetadata;
    const event = await prisma.systemHealthEvent.create({
      data: {
        service: params.service,
        operation: params.operation,
        integration: params.integration,
        route: params.route,
        status: params.status,
        severity: params.severity,
        merchantId: params.merchantId,
        userId: params.userId,
        requestId: params.requestId,
        externalId: params.externalId,
        message: safeMessage,
        metadata: metadataWithErrorCode,
        errorGroupId,
        wgcReference,
        release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      },
      select: { id: true },
    });

    return { eventId: event.id, wgcReference };
  } catch (err) {
    console.error("[recordHealthEvent] Failed to record health event:", err);
    return null;
  }
}
