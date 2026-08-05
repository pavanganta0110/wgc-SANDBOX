import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * The single writer for WgcBillingAuditLog — every billing/promotion state
 * change (automatic or admin-initiated) goes through this so the shape
 * stays consistent (actor, organization, action, previous/new value,
 * reason, Finix-relevant IDs via metadata).
 */
export interface LogBillingAuditEventInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  internalReason?: string;
  customerFacingReason?: string;
  idempotencyKey?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function logBillingAuditEvent(input: LogBillingAuditEventInput): Promise<void> {
  await prisma.wgcBillingAuditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      previousValue: (input.previousValue as Prisma.InputJsonValue) ?? undefined,
      newValue: (input.newValue as Prisma.InputJsonValue) ?? undefined,
      internalReason: input.internalReason ?? null,
      customerFacingReason: input.customerFacingReason ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
