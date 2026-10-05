import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { WGC_EVENT_TYPES, isWgcEventType } from "@/lib/events/types";
import { generateSigningSecret } from "@/lib/webhooks/signing";
import { encryptSecret, serializeEnvelope } from "@/lib/webhooks/encryption";

function isValidHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

// Never returned in a list/detail response — only the freshly-generated
// plaintext secret at creation time gets the full value.
function toPublicEndpoint<T extends { signingSecretEncrypted: string }>(endpoint: T): Omit<T, "signingSecretEncrypted"> {
  const rest: Record<string, unknown> = { ...endpoint };
  delete rest.signingSecretEncrypted;
  return rest as Omit<T, "signingSecretEncrypted">;
}

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageWebhooks");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { churchId: auth.churchId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ endpoints: endpoints.map(toPublicEndpoint), availableEvents: WGC_EVENT_TYPES });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageWebhooks");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json();
  const { url, description, subscribedEvents } = body;

  if (!isValidHttpsUrl(url)) {
    return NextResponse.json({ error: "A valid https:// URL is required" }, { status: 400 });
  }
  const events = Array.isArray(subscribedEvents) ? subscribedEvents.filter(isWgcEventType) : [];
  if (events.length === 0) {
    return NextResponse.json({ error: "Select at least one event to subscribe to" }, { status: 400 });
  }

  const plaintextSecret = generateSigningSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      churchId: auth.churchId,
      url,
      description: typeof description === "string" ? description.trim().slice(0, 500) || null : null,
      subscribedEventsJson: events,
      signingSecretEncrypted: serializeEnvelope(encryptSecret(plaintextSecret)),
      signingSecretLast4: plaintextSecret.slice(-4),
      createdByUserId: auth.userId,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "webhook_endpoint.created",
    entityType: "WebhookEndpoint",
    entityId: endpoint.id,
    metadata: { url, subscribedEvents: events },
    req,
  });

  // The only moment the full secret is ever returned — the dashboard must
  // show it once, then never again (mirrors an API-key show-once flow).
  return NextResponse.json({ endpoint: toPublicEndpoint(endpoint), signingSecret: plaintextSecret });
}
