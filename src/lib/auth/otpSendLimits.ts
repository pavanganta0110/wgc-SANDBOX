import { prisma } from "@/lib/prisma";

/** Conservative production defaults — deliberately hardcoded rather than
 * env-configurable, since these exist specifically to bound SMS cost/abuse
 * and shouldn't be loosened by a stray env var change. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_SENDS_PER_ACCOUNT_PER_HOUR = 5;
export const OTP_MAX_SENDS_PER_ACCOUNT_PER_DAY = 10;
export const OTP_MAX_SENDS_PER_PHONE_PER_DAY = 10;
/** Coarser than the account/phone caps on purpose — this exists to catch
 * one IP hammering many different accounts (which the per-account caps
 * above can't see), not to be the primary limiter. */
export const OTP_MAX_SENDS_PER_IP_PER_HOUR = 15;

export type OtpSendPurpose = "ENROLL" | "LOGIN" | "RESEND" | "ADMIN_LOGIN" | "ADMIN_RESEND";

export interface OtpSendLimitResult {
  allowed: boolean;
  reason?: "COOLDOWN" | "ACCOUNT_HOURLY" | "ACCOUNT_DAILY" | "PHONE_DAILY" | "IP_HOURLY";
  /** Seconds until the next send is allowed — only meaningful for COOLDOWN. */
  retryAfterSeconds?: number;
}

/**
 * DB-backed (not in-memory) — checked against AuthSmsSendLog rows, so the
 * limit holds across serverless instances/deployments, not just within one
 * warm process. Called BEFORE actually sending; the caller only writes a
 * new AuthSmsSendLog row (recordOtpSend) once the send is allowed and
 * attempted.
 */
export async function checkOtpSendLimits(input: { userId: string; phone: string; ipAddress: string | null }): Promise<OtpSendLimitResult> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const lastSend = await prisma.authSmsSendLog.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastSend) {
    const secondsSinceLast = (now.getTime() - lastSend.createdAt.getTime()) / 1000;
    if (secondsSinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
      return { allowed: false, reason: "COOLDOWN", retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast) };
    }
  }

  const [hourlyAccountCount, dailyAccountCount, dailyPhoneCount, hourlyIpCount] = await Promise.all([
    prisma.authSmsSendLog.count({ where: { userId: input.userId, createdAt: { gte: oneHourAgo } } }),
    prisma.authSmsSendLog.count({ where: { userId: input.userId, createdAt: { gte: oneDayAgo } } }),
    prisma.authSmsSendLog.count({ where: { phone: input.phone, createdAt: { gte: oneDayAgo } } }),
    input.ipAddress
      ? prisma.authSmsSendLog.count({ where: { ipAddress: input.ipAddress, createdAt: { gte: oneHourAgo } } })
      : Promise.resolve(0),
  ]);

  if (hourlyAccountCount >= OTP_MAX_SENDS_PER_ACCOUNT_PER_HOUR) return { allowed: false, reason: "ACCOUNT_HOURLY" };
  if (dailyAccountCount >= OTP_MAX_SENDS_PER_ACCOUNT_PER_DAY) return { allowed: false, reason: "ACCOUNT_DAILY" };
  if (dailyPhoneCount >= OTP_MAX_SENDS_PER_PHONE_PER_DAY) return { allowed: false, reason: "PHONE_DAILY" };
  if (input.ipAddress && hourlyIpCount >= OTP_MAX_SENDS_PER_IP_PER_HOUR) return { allowed: false, reason: "IP_HOURLY" };

  return { allowed: true };
}

/** Records a send attempt — call after checkOtpSendLimits allows it and the
 * actual Twilio call has been made (successful or not; a failed send still
 * counts against the caps, since it still cost an API call and the
 * cooldown still applies — otherwise a targeted Twilio failure could be
 * used to bypass the cooldown by retrying immediately). */
export async function recordOtpSend(input: {
  userId: string;
  phone: string;
  purpose: OtpSendPurpose;
  ipAddress: string | null;
  providerMessageId?: string | null;
}) {
  return prisma.authSmsSendLog.create({
    data: {
      userId: input.userId,
      phone: input.phone,
      purpose: input.purpose,
      ipAddress: input.ipAddress,
      providerMessageId: input.providerMessageId ?? null,
    },
  });
}

/** User-facing message for a rate-limited send — never reveals which
 * specific limit was hit (account vs phone vs IP), just that they need to
 * wait, matching this codebase's account-enumeration-safe error convention. */
export function otpSendLimitMessage(result: OtpSendLimitResult): string {
  if (result.reason === "COOLDOWN" && result.retryAfterSeconds) {
    return `Please wait ${result.retryAfterSeconds}s before requesting another code.`;
  }
  return "Too many verification code requests. Please try again later.";
}
