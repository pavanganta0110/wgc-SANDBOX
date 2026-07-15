import { prisma } from "@/lib/prisma";

export interface AuditLogOptions {
  action: string;
  onboardingApplicationId?: string;
  actorEmail?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(options: AuditLogOptions) {
  try {
    await prisma.auditLog.create({
      data: {
        action: options.action,
        onboardingApplicationId: options.onboardingApplicationId,
        actorEmail: options.actorEmail,
        metadata: options.metadata || undefined,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Don't throw - audit logging shouldn't break the main flow
  }
}
