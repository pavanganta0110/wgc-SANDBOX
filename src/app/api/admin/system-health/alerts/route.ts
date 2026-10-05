import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

/**
 * Global-admin-only. Lists SystemAlert rows (every notification actually
 * sent or attempted by alertEngine.ts) newest-first, with the parent
 * incident's title/service joined in for display. Optional filters:
 * channel (DASHBOARD/EMAIL/SMS), deliveryStatus (PENDING/SENT/FAILED),
 * notificationType (INITIAL/ESCALATION/REMINDER/RECOVERY). No PII beyond the
 * platform-admin recipient address/number itself (never a donor or
 * merchant contact — see the SystemAlert model's own comment).
 */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel") || undefined;
  const deliveryStatus = searchParams.get("deliveryStatus") || undefined;
  const notificationType = searchParams.get("notificationType") || undefined;

  const where: Prisma.SystemAlertWhereInput = {
    ...(channel ? { channel } : {}),
    ...(deliveryStatus ? { deliveryStatus } : {}),
    ...(notificationType ? { notificationType } : {}),
  };

  const alerts = await prisma.systemAlert.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: 300,
    include: { incident: { select: { id: true, title: true, service: true } } },
  });

  return NextResponse.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      incidentId: a.incidentId,
      incidentTitle: a.incident.title,
      service: a.incident.service,
      severity: a.severity,
      channel: a.channel,
      notificationType: a.notificationType,
      recipient: a.recipient,
      deliveryStatus: a.deliveryStatus,
      providerMessageId: a.providerMessageId,
      failureReason: a.failureReason,
      sentAt: a.sentAt,
    })),
  });
}
