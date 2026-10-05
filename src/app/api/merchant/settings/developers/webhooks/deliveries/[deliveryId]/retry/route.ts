import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { attemptWebhookDelivery } from "@/lib/webhooks/deliverWebhook";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function POST(req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageWebhooks");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const delivery = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, churchId: auth.churchId } });
  if (!delivery) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  if (delivery.status === "SUCCEEDED") {
    return NextResponse.json({ error: "This delivery already succeeded" }, { status: 400 });
  }

  // A manual retry re-opens an ABANDONED delivery for one more attempt —
  // reset to FAILED (retryable) rather than leaving it permanently
  // exhausted just because the automatic schedule ran out.
  if (delivery.status === "ABANDONED") {
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "FAILED" } });
  }

  await attemptWebhookDelivery(deliveryId);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "webhook_delivery.manually_retried",
    entityType: "WebhookDelivery",
    entityId: deliveryId,
    req,
  });

  const result = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  return NextResponse.json({ delivery: result });
}
