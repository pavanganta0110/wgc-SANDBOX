import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Every structured OTP/2FA security event this app records. Success vs.
 * failure is encoded in the action name itself (e.g. OTP_VERIFIED vs
 * OTP_FAILED) and duplicated as a boolean in metadata for easy querying —
 * never inferred from anything else. */
export type OtpAuditAction =
  | "OTP_SENT"
  | "OTP_RESENT"
  | "OTP_VERIFIED"
  | "OTP_FAILED"
  | "OTP_EXPIRED"
  | "OTP_RATE_LIMITED"
  | "LOGIN_2FA_SUCCESS"
  | "LOGIN_2FA_FAILED"
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "PHONE_CHANGED"
  | "ADMIN_MFA_ENABLED"
  | "ADMIN_LOGIN_2FA_SUCCESS"
  | "ADMIN_LOGIN_2FA_FAILED"
  | "ADMIN_MFA_SETUP_REQUIRED_BLOCK";

const SUCCESS_ACTIONS: ReadonlySet<OtpAuditAction> = new Set([
  "OTP_SENT",
  "OTP_RESENT",
  "OTP_VERIFIED",
  "LOGIN_2FA_SUCCESS",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "PHONE_CHANGED",
  "ADMIN_MFA_ENABLED",
  "ADMIN_LOGIN_2FA_SUCCESS",
]);

/**
 * Writes one structured OTP/2FA audit event. Never pass the OTP value or
 * its hash in `metadata` — this function doesn't strip it for you, callers
 * are responsible for only including safe fields (userId/challenge/ip-
 * adjacent data), matching this codebase's existing "no sensitive data in
 * logs" convention (see e.g. SmsConsentEvent's own comment on this).
 *
 * churchId present -> DashboardAuditLog (org-scoped, same table every
 * other merchant-side security event already uses). churchId absent (WGC
 * internal admin events) -> the WGC-level AuditLog table, matching how
 * admin login failures are already recorded today.
 */
export async function logOtpEvent(params: {
  action: OtpAuditAction;
  userId?: string | null;
  churchId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const success = SUCCESS_ACTIONS.has(params.action);
  const metadata = { ...params.metadata, success };

  if (params.churchId) {
    await prisma.dashboardAuditLog.create({
      data: {
        churchId: params.churchId,
        actorUserId: params.userId ?? null,
        actorEmail: params.actorEmail ?? null,
        action: params.action,
        entityType: "AuthSms",
        metadata: metadata as Prisma.InputJsonValue,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
    return;
  }

  await prisma.auditLog.create({
    data: {
      action: params.action,
      actorEmail: params.actorEmail ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}
