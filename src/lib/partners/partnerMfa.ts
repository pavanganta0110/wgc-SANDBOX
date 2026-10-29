import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { generateMfaChallengeId, generateMfaCode, hashMfaCode, MFA_CODE_TTL_MINUTES, MFA_MAX_CODE_ATTEMPTS } from "@/lib/auth/mfaCode";

/**
 * Second step of a partner sign-in: after the password is right, a 6-digit code is emailed
 * and must be entered. Partner staff have no phone number on file, so the code goes to
 * the email address that was invited. The code lives 10 minutes, works once, and locks
 * after 5 wrong guesses (a fresh code is then needed). Only hashes are stored.
 *
 * A switch for local development only (PARTNER_MFA_DISABLED=1) skips the step; it is
 * ignored when NODE_ENV is production, whatever the variable says.
 */

export const PARTNER_MFA_RESEND_COOLDOWN_MS = 30_000;

export function isPartnerMfaDisabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PARTNER_MFA_DISABLED === "1";
}

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "your email";
  return `${name.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(name.length - 1, 6)))}@${domain}`;
}

async function sendCode(email: string, code: string): Promise<boolean> {
  const result = await sendWgcEmail({
    to: email,
    subject: "Your WGC Payments partner sign-in code",
    title: "Your sign-in code",
    badgeText: "Sign-in code",
    badgeColor: "#0B5DBC",
    bodyHtml: `<p>Your partner sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It works once and expires in ${MFA_CODE_TTL_MINUTES} minutes. If you didn't try to sign in, you can ignore this email and consider changing your password.</p>`,
  });
  return result.success;
}

/** Starts the second step: stores a hashed code and a challenge id, emails the code. */
export async function startPartnerMfa(user: { id: string; email: string }, now: Date = new Date()): Promise<{ challengeId: string; sent: boolean }> {
  const { code, codeHash } = generateMfaCode();
  const challengeId = generateMfaChallengeId();
  await prisma.partnerUser.update({
    where: { id: user.id },
    data: {
      mfaCodeHash: codeHash,
      mfaCodeExpiresAt: new Date(now.getTime() + MFA_CODE_TTL_MINUTES * 60 * 1000),
      mfaCodeAttempts: 0,
      mfaCodeSentAt: now,
      mfaChallengeHash: sha256(challengeId),
    },
  });
  return { challengeId, sent: await sendCode(user.email, code) };
}

export type ResendResult = { ok: true } | { ok: false; reason: "invalid" | "too_soon" | "send_failed" };

/** A new code for an open challenge, no more often than the cooldown. */
export async function resendPartnerMfa(challengeId: string, now: Date = new Date()): Promise<ResendResult> {
  if (!challengeId || challengeId.length > 200) return { ok: false, reason: "invalid" };
  const user = await prisma.partnerUser.findUnique({
    where: { mfaChallengeHash: sha256(challengeId) },
    select: { id: true, email: true, disabledAt: true, mfaCodeSentAt: true, mfaCodeExpiresAt: true },
  });
  if (!user || user.disabledAt || !user.mfaCodeExpiresAt) return { ok: false, reason: "invalid" };
  if (user.mfaCodeSentAt && now.getTime() - user.mfaCodeSentAt.getTime() < PARTNER_MFA_RESEND_COOLDOWN_MS) return { ok: false, reason: "too_soon" };

  const { code, codeHash } = generateMfaCode();
  await prisma.partnerUser.update({
    where: { id: user.id },
    data: { mfaCodeHash: codeHash, mfaCodeExpiresAt: new Date(now.getTime() + MFA_CODE_TTL_MINUTES * 60 * 1000), mfaCodeAttempts: 0, mfaCodeSentAt: now },
  });
  return (await sendCode(user.email, code)) ? { ok: true } : { ok: false, reason: "send_failed" };
}

export type VerifyResult =
  | { ok: true; user: { id: string; partnerId: string; email: string; authVersion: number } }
  | { ok: false; reason: "invalid" | "expired" | "locked" };

/** Checks the code. The code is spent by a conditional update, so two requests can't both use it. */
export async function verifyPartnerMfa(challengeId: string, code: string, now: Date = new Date()): Promise<VerifyResult> {
  if (!challengeId || challengeId.length > 200 || !/^\d{6}$/.test(code)) return { ok: false, reason: "invalid" };

  const user = await prisma.partnerUser.findUnique({
    where: { mfaChallengeHash: sha256(challengeId) },
    select: {
      id: true,
      partnerId: true,
      email: true,
      authVersion: true,
      disabledAt: true,
      mfaCodeHash: true,
      mfaCodeExpiresAt: true,
      mfaCodeAttempts: true,
      partner: { select: { status: true } },
    },
  });
  if (!user || user.disabledAt || user.partner.status !== "ACTIVE" || !user.mfaCodeHash || !user.mfaCodeExpiresAt) return { ok: false, reason: "invalid" };
  if (user.mfaCodeExpiresAt < now) return { ok: false, reason: "expired" };
  if (user.mfaCodeAttempts >= MFA_MAX_CODE_ATTEMPTS) return { ok: false, reason: "locked" };

  const expected = Buffer.from(user.mfaCodeHash, "hex");
  const actual = Buffer.from(hashMfaCode(code), "hex");
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!matches) {
    await prisma.partnerUser.updateMany({ where: { id: user.id, mfaCodeAttempts: { lt: MFA_MAX_CODE_ATTEMPTS } }, data: { mfaCodeAttempts: { increment: 1 } } });
    return { ok: false, reason: user.mfaCodeAttempts + 1 >= MFA_MAX_CODE_ATTEMPTS ? "locked" : "invalid" };
  }

  const spent = await prisma.partnerUser.updateMany({
    where: { id: user.id, mfaCodeHash: user.mfaCodeHash, mfaCodeAttempts: { lt: MFA_MAX_CODE_ATTEMPTS } },
    data: { mfaCodeHash: null, mfaCodeExpiresAt: null, mfaCodeAttempts: 0, mfaChallengeHash: null, lastLoginAt: now },
  });
  if (spent.count !== 1) return { ok: false, reason: "invalid" };
  return { ok: true, user: { id: user.id, partnerId: user.partnerId, email: user.email, authVersion: user.authVersion } };
}
