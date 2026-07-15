import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function logDashboardAction(params: {
  churchId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}) {
  const headers = params.req?.headers;
  await prisma.dashboardAuditLog.create({
    data: {
      churchId: params.churchId,
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail ?? null,
      actorRole: params.actorRole ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      ipAddress: headers?.get("x-forwarded-for") || headers?.get("x-real-ip") || null,
      userAgent: headers?.get("user-agent") || null,
    },
  });
}
