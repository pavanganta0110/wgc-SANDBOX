import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { generateSigningSecret } from "@/lib/webhooks/signing";
import { encryptSecret, serializeEnvelope } from "@/lib/webhooks/encryption";

export async function POST(req: Request, { params }: { params: Promise<{ endpointId: string }> }) {
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

  const plaintextSecret = generateSigningSecret();
  await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: {
      signingSecretEncrypted: serializeEnvelope(encryptSecret(plaintextSecret)),
      signingSecretLast4: plaintextSecret.slice(-4),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "webhook_endpoint.secret_rotated",
    entityType: "WebhookEndpoint",
    entityId: endpointId,
    req,
  });

  // Only moment the new secret is ever shown.
  return NextResponse.json({ signingSecret: plaintextSecret });
}
