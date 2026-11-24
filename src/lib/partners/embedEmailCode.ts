import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { generateMfaCode, hashMfaCode, MFA_CODE_TTL_MINUTES, MFA_MAX_CODE_ATTEMPTS } from "@/lib/auth/mfaCode";
import type { PartnerEmbedLinkPayload } from "@/lib/partners/embedLink";
import { EMBED_ROLES, type EmbedUser } from "@/lib/partners/embedEntry";

/**
 * The one-time code emailed to a person who types their email inside a partner's frame
 * (embedSignInMode EMAIL_CODE). The signed link says which partner organization this is; the
 * email must belong to someone on that organization's team, so a code only ever goes to a
 * person who was added there. Accepting a code starts that person's own embedded session.
 */

export const EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 60;
export const EMAIL_CODE_MAX_SENDS_PER_HOUR = 5;

/** The person on the linked organization's team with this email, or null (not added, wrong role, disabled). */
export async function findTeamMemberByEmail(payload: Pick<PartnerEmbedLinkPayload, "partnerId" | "reference">, email: string): Promise<EmbedUser | null> {
  const church = await prisma.church.findFirst({ where: { partnerId: payload.partnerId, partnerReference: payload.reference }, select: { id: true } });
  if (!church) return null;
  const user = await prisma.user.findFirst({
    where: { churchId: church.id, email, role: { in: EMBED_ROLES } },
    select: { id: true, email: true, role: true, churchId: true, authVersion: true, disabledAt: true },
  });
  if (!user || !user.churchId || user.disabledAt) return null;
  return { id: user.id, email: user.email, role: user.role, churchId: user.churchId, authVersion: user.authVersion };
}

export type IssueEmailCodeResult = { status: "sent"; code: string } | { status: "cooldown"; retryAfterSeconds: number } | { status: "limited" };

/** Creates a new code (replacing any earlier unused one) unless the person asked too recently or too often. The caller emails it. */
export async function issueEmailCode(user: Pick<EmbedUser, "id" | "churchId">, now: Date = new Date()): Promise<IssueEmailCodeResult> {
  const last = await prisma.partnerEmbedEmailCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last) {
    const seconds = (now.getTime() - last.createdAt.getTime()) / 1000;
    if (seconds < EMAIL_CODE_RESEND_COOLDOWN_SECONDS) return { status: "cooldown", retryAfterSeconds: Math.ceil(EMAIL_CODE_RESEND_COOLDOWN_SECONDS - seconds) };
  }
  const lastHour = await prisma.partnerEmbedEmailCode.count({ where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } } });
  if (lastHour >= EMAIL_CODE_MAX_SENDS_PER_HOUR) return { status: "limited" };

  await prisma.partnerEmbedEmailCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
  const { code, codeHash } = generateMfaCode();
  await prisma.partnerEmbedEmailCode.create({ data: { userId: user.id, churchId: user.churchId, codeHash, expiresAt: new Date(now.getTime() + MFA_CODE_TTL_MINUTES * 60 * 1000) } });
  return { status: "sent", code };
}

/**
 * True when the code is the person's current one. Each guess is counted before it is compared
 * (atomically), so parallel requests cannot get more than MFA_MAX_CODE_ATTEMPTS tries, and a
 * correct code is claimed once. Wrong, expired, used and exhausted codes all look the same.
 */
export async function verifyEmailCode(userId: string, code: string, now: Date = new Date()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const row = await prisma.partnerEmbedEmailCode.findFirst({ where: { userId, usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, select: { id: true, codeHash: true } });
  if (!row) return false;

  const counted = await prisma.partnerEmbedEmailCode.updateMany({ where: { id: row.id, usedAt: null, attempts: { lt: MFA_MAX_CODE_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
  if (counted.count !== 1) return false;

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashMfaCode(code), "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;

  const claimed = await prisma.partnerEmbedEmailCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  return claimed.count === 1;
}
