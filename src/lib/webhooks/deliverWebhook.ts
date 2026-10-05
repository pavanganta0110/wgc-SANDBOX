import { prisma } from "@/lib/prisma";
import { signWebhookPayload } from "@/lib/webhooks/signing";
import { decryptSecret, deserializeEnvelope } from "@/lib/webhooks/encryption";
import { computeNextRetryAt, MAX_DELIVERY_ATTEMPTS, AUTO_DISABLE_FAILURE_THRESHOLD } from "@/lib/webhooks/retryPolicy";
import { logDashboardAction } from "@/lib/dashboardAudit";

const DELIVERY_TIMEOUT_MS = 10_000;
const RESPONSE_SNIPPET_MAX_CHARS = 2000;

/**
 * Attempts one delivery of a WebhookDelivery row and records the outcome.
 * Called both for the immediate first-attempt delivery (from emitEvent)
 * and from the retry cron for later attempts — same function either way,
 * so the recorded attempt history is consistent regardless of which path
 * triggered it.
 *
 * Never throws — a delivery failure (network error, non-2xx, timeout) is a
 * normal, expected outcome recorded on the row, not an exception the
 * caller needs to handle. The only thing that can still throw is a
 * genuine programming/config error (e.g. a corrupt encrypted secret),
 * which is caught here too and recorded as a failed attempt so a bad
 * endpoint can never crash the caller (a request handler or the cron).
 */
export async function attemptWebhookDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery || delivery.status === "SUCCEEDED" || delivery.status === "ABANDONED") return;

  const [event, endpoint] = await Promise.all([
    prisma.webhookEvent.findUnique({ where: { id: delivery.webhookEventId } }),
    prisma.webhookEndpoint.findUnique({ where: { id: delivery.webhookEndpointId } }),
  ]);
  if (!event || !endpoint || endpoint.status !== "ACTIVE") {
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "ABANDONED", errorMessage: "Endpoint no longer active" } });
    return;
  }

  const attemptCount = delivery.attemptCount + 1;
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = { id: event.id, type: event.type, createdAt: event.createdAt.toISOString(), data: event.dataJson };
  const rawBody = JSON.stringify(payload);

  let result: { ok: boolean; statusCode?: number; bodySnippet?: string; error?: string };
  try {
    const secret = decryptSecret(deserializeEnvelope(endpoint.signingSecretEncrypted));
    const signatureHeader = signWebhookPayload(rawBody, secret, timestamp);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "WGC-Signature": signatureHeader,
          "WGC-Event-Id": event.id,
          "WGC-Event-Type": event.type,
        },
        body: rawBody,
        signal: controller.signal,
      });
      const bodyText = await res.text().catch(() => "");
      result = {
        ok: res.ok,
        statusCode: res.status,
        bodySnippet: bodyText.slice(0, RESPONSE_SNIPPET_MAX_CHARS),
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    result = { ok: false, error: isAbort ? "Request timed out" : err instanceof Error ? err.message : "Unknown delivery error" };
  }

  const now = new Date();
  if (result.ok) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "SUCCEEDED",
          attemptCount,
          lastAttemptAt: now,
          responseStatusCode: result.statusCode,
          responseBodySnippet: result.bodySnippet,
          signedAtTimestamp: timestamp,
          errorMessage: null,
        },
      }),
      prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { consecutiveFailures: 0, lastDeliveryAt: now, lastSuccessAt: now },
      }),
    ]);
    return;
  }

  const exhausted = attemptCount >= MAX_DELIVERY_ATTEMPTS;
  const nextRetryAt = exhausted ? null : computeNextRetryAt(attemptCount, now);
  const newConsecutiveFailures = endpoint.consecutiveFailures + 1;
  const shouldAutoDisable = newConsecutiveFailures >= AUTO_DISABLE_FAILURE_THRESHOLD && endpoint.status === "ACTIVE";

  await prisma.$transaction([
    prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: exhausted ? "ABANDONED" : "FAILED",
        attemptCount,
        lastAttemptAt: now,
        nextRetryAt,
        responseStatusCode: result.statusCode ?? null,
        responseBodySnippet: result.bodySnippet ?? null,
        signedAtTimestamp: timestamp,
        errorMessage: result.error ?? "Unknown error",
      },
    }),
    prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        consecutiveFailures: newConsecutiveFailures,
        lastDeliveryAt: now,
        ...(shouldAutoDisable ? { status: "DISABLED_AUTO", disabledAt: now, disabledReason: `Auto-disabled after ${newConsecutiveFailures} consecutive failed deliveries` } : {}),
      },
    }),
  ]);

  if (shouldAutoDisable) {
    try {
      await logDashboardAction({
        churchId: endpoint.churchId,
        action: "webhook_endpoint.auto_disabled",
        entityType: "WebhookEndpoint",
        entityId: endpoint.id,
        metadata: { url: endpoint.url, consecutiveFailures: newConsecutiveFailures },
      });
    } catch {
      // Audit logging must never break delivery bookkeeping.
    }
  }
}
