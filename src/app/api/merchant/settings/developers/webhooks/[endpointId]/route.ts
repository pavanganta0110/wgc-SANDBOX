import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { isWgcEventType } from "@/lib/events/types";

function isValidHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function toPublicEndpoint<T extends { signingSecretEncrypted: string }>(endpoint: T): Omit<T, "signingSecretEncrypted"> {
  const rest: Record<string, unknown> = { ...endpoint };
  delete rest.signingSecretEncrypted;
  return rest as Omit<T, "signingSecretEncrypted">;
}

export async function GET(req: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageWebhooks");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, churchId: auth.churchId } });
  if (!endpoint) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 });

  return NextResponse.json({ endpoint: toPublicEndpoint(endpoint) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageWebhooks");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, churchId: auth.churchId } });
  if (!existing) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 });

  const body = await req.json();
  const { url, description, subscribedEvents, status } = body;

  if (url !== undefined && !isValidHttpsUrl(url)) {
    return NextResponse.json({ error: "A valid https:// URL is required" }, { status: 400 });
  }
  let events: string[] | undefined;
  if (subscribedEvents !== undefined) {
    events = Array.isArray(subscribedEvents) ? subscribedEvents.filter(isWgcEventType) : [];
    if (events.length === 0) {
      return NextResponse.json({ error: "Select at least one event to subscribe to" }, { status: 400 });
    }
  }
  if (status !== undefined && status !== "ACTIVE" && status !== "DISABLED") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: {
      ...(url !== undefined ? { url } : {}),
      ...(description !== undefined ? { description: description?.trim().slice(0, 500) || null } : {}),
      ...(events !== undefined ? { subscribedEventsJson: events } : {}),
      // Re-enabling manually clears the auto-disable bookkeeping so the
      // endpoint gets a fresh failure count rather than being immediately
      // re-disabled by stale counters.
      ...(status === "ACTIVE" ? { status: "ACTIVE", consecutiveFailures: 0, disabledAt: null, disabledReason: null } : {}),
      ...(status === "DISABLED" ? { status: "DISABLED", disabledAt: new Date(), disabledReason: "Disabled by merchant" } : {}),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "webhook_endpoint.updated",
    entityType: "WebhookEndpoint",
    entityId: endpointId,
    metadata: { changes: Object.keys(body) },
    req,
  });

  return NextResponse.json({ endpoint: toPublicEndpoint(updated) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageWebhooks");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, churchId: auth.churchId } });
  if (!existing) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 });

  await prisma.webhookEndpoint.delete({ where: { id: endpointId } });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "webhook_endpoint.deleted",
    entityType: "WebhookEndpoint",
    entityId: endpointId,
    metadata: { url: existing.url },
    req,
  });

  return NextResponse.json({ ok: true });
}
