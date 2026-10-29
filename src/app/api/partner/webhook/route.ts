import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession } from "@/lib/partners/partnerSession";
import { PARTNER_DEFAULT_EVENTS, PARTNER_ONBOARDING_EVENTS } from "@/lib/partners/partnerWebhooks";
import { WGC_EVENT_TYPES, isWgcEventType } from "@/lib/events/types";

const ALL_PARTNER_EVENT_TYPES: string[] = [...PARTNER_ONBOARDING_EVENTS, ...WGC_EVENT_TYPES];
const isPartnerEventType = (value: unknown): value is string => isWgcEventType(value) || (typeof value === "string" && (PARTNER_ONBOARDING_EVENTS as readonly string[]).includes(value));
import { generateSigningSecret } from "@/lib/webhooks/signing";
import { encryptSecret, serializeEnvelope } from "@/lib/webhooks/encryption";
import { isAllowedPartnerWebhookUrl } from "@/lib/webhooks/webhookUrl";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The webhook, how it has been doing, and the latest deliveries. Never includes the secret. */
export async function GET() {
  try {
    const session = await requirePartnerSession();
    const endpoint = await prisma.partnerWebhookEndpoint.findUnique({
      where: { partnerId: session.partnerId },
      select: {
        id: true,
        url: true,
        status: true,
        subscribedEventsJson: true,
        signingSecretLast4: true,
        disabledReason: true,
        consecutiveFailures: true,
        lastDeliveryAt: true,
        lastSuccessAt: true,
        createdAt: true,
      },
    });

    let deliveries: unknown[] = [];
    let last24h = { succeeded: 0, failed: 0 };
    if (endpoint) {
      const since = new Date(Date.now() - DAY_MS);
      const [recent, succeeded, failed] = await Promise.all([
        prisma.partnerWebhookDelivery.findMany({
          where: { partnerId: session.partnerId },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: { id: true, webhookEventId: true, partnerEventId: true, churchId: true, status: true, attemptCount: true, lastAttemptAt: true, responseStatusCode: true, errorMessage: true, createdAt: true },
        }),
        prisma.partnerWebhookDelivery.count({ where: { partnerId: session.partnerId, createdAt: { gte: since }, status: "SUCCEEDED" } }),
        prisma.partnerWebhookDelivery.count({ where: { partnerId: session.partnerId, createdAt: { gte: since }, status: { in: ["FAILED", "ABANDONED"] } } }),
      ]);
      const churchIds = [...new Set(recent.flatMap((d) => (d.churchId ? [d.churchId] : [])))];
      const orgEventIds = recent.flatMap((d) => (d.webhookEventId ? [d.webhookEventId] : []));
      const partnerEventIds = recent.flatMap((d) => (d.partnerEventId ? [d.partnerEventId] : []));
      const [events, partnerEvents, churches] = await Promise.all([
        prisma.webhookEvent.findMany({ where: { id: { in: orgEventIds } }, select: { id: true, type: true } }),
        prisma.partnerEvent.findMany({ where: { id: { in: partnerEventIds }, partnerId: session.partnerId }, select: { id: true, type: true, dataJson: true } }),
        prisma.church.findMany({ where: { id: { in: churchIds }, partnerId: session.partnerId }, select: { id: true, name: true } }),
      ]);
      const typeById = new Map<string, string>([...events.map((e) => [e.id, e.type] as const), ...partnerEvents.map((e) => [e.id, e.type] as const)]);
      const nameById = new Map(churches.map((c) => [c.id, c.name]));
      const orgNameOfPartnerEvent = new Map(partnerEvents.map((e) => [e.id, ((e.dataJson as { organization?: { name?: string | null } } | null)?.organization?.name ?? null)]));
      deliveries = recent.map((d) => ({
        ...d,
        eventType: typeById.get(d.webhookEventId ?? d.partnerEventId ?? "") ?? null,
        organizationName: (d.churchId ? nameById.get(d.churchId) : null) ?? (d.partnerEventId ? orgNameOfPartnerEvent.get(d.partnerEventId) : null) ?? null,
      }));
      last24h = { succeeded, failed };
    }

    return NextResponse.json({ endpoint, deliveries, last24h, availableEvents: ALL_PARTNER_EVENT_TYPES, defaultEvents: PARTNER_DEFAULT_EVENTS });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/**
 * Creates the webhook (returning its signing secret once) or changes its URL,
 * events or on/off state. Turning it back on clears the failure count.
 */
export async function PUT(req: Request) {
  try {
    const session = await requirePartnerSession();
    const body = await req.json().catch(() => ({}));

    const existing = await prisma.partnerWebhookEndpoint.findUnique({ where: { partnerId: session.partnerId }, select: { id: true } });

    const url = body.url;
    if (!isAllowedPartnerWebhookUrl(url)) {
      return NextResponse.json({ error: "Enter a public https:// address. Localhost and private network addresses aren't allowed." }, { status: 400 });
    }
    const events: string[] = Array.isArray(body.events) ? [...new Set<string>(body.events.filter(isPartnerEventType))] : [];
    if (events.length === 0) return NextResponse.json({ error: "Choose at least one event." }, { status: 400 });

    if (!existing) {
      const secret = generateSigningSecret();
      const endpoint = await prisma.partnerWebhookEndpoint.create({
        data: {
          partnerId: session.partnerId,
          url,
          subscribedEventsJson: events,
          signingSecretEncrypted: serializeEnvelope(encryptSecret(secret)),
          signingSecretLast4: secret.slice(-4),
          createdByPartnerUserId: session.partnerUserId,
        },
        select: { id: true, url: true, status: true },
      });
      await createAuditLog({ action: "PARTNER_WEBHOOK_CREATED", actorEmail: session.email, metadata: { partnerId: session.partnerId, url, events } });
      // The only time the full secret is ever returned.
      return NextResponse.json({ endpoint, signingSecret: secret });
    }

    const enabled = body.enabled !== false;
    const endpoint = await prisma.partnerWebhookEndpoint.update({
      where: { id: existing.id },
      data: {
        url,
        subscribedEventsJson: events,
        ...(enabled
          ? { status: "ACTIVE", disabledAt: null, disabledReason: null, consecutiveFailures: 0 }
          : { status: "DISABLED", disabledAt: new Date(), disabledReason: "Turned off by you" }),
      },
      select: { id: true, url: true, status: true },
    });
    await createAuditLog({ action: "PARTNER_WEBHOOK_UPDATED", actorEmail: session.email, metadata: { partnerId: session.partnerId, url, events, enabled } });
    return NextResponse.json({ endpoint });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
