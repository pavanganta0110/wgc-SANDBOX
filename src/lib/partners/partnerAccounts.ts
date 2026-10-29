import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const PARTNER_INVITE_TTL_DAYS = 7;
export const PARTNER_PASSWORD_MIN_LENGTH = 12;

export class PartnerAccountError extends Error {
  constructor(
    public readonly code: "email_in_use" | "invalid_link" | "weak_password" | "disabled" | "partner_not_found",
    message: string
  ) {
    super(message);
    this.name = "PartnerAccountError";
  }
}

export function hashPartnerToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function slugifyPartnerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Starts (or restarts) an invite for one person at a partner. Only the hash of
 * the link is stored. A person who already set a password can't be re-invited
 * this way, since that would let an invite reset someone's password.
 */
export async function createPartnerInvite(params: {
  partnerId: string;
  email: string;
  name?: string | null;
}): Promise<{ rawToken: string; userId: string; expiresAt: Date }> {
  const email = params.email.trim().toLowerCase();
  const partner = await prisma.partner.findUnique({ where: { id: params.partnerId }, select: { id: true } });
  if (!partner) throw new PartnerAccountError("partner_not_found", "Partner not found.");

  const existing = await prisma.partnerUser.findUnique({ where: { email }, select: { id: true, partnerId: true, passwordHash: true } });
  if (existing && (existing.partnerId !== params.partnerId || existing.passwordHash)) {
    throw new PartnerAccountError("email_in_use", "That email already has a partner account.");
  }
  const orgUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (orgUser) throw new PartnerAccountError("email_in_use", "That email already belongs to an organization or admin account.");

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PARTNER_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const data = {
    name: params.name?.trim() || null,
    setPasswordTokenHash: hashPartnerToken(rawToken),
    setPasswordTokenExpiresAt: expiresAt,
  };
  const user = existing
    ? await prisma.partnerUser.update({ where: { id: existing.id }, data })
    : await prisma.partnerUser.create({ data: { partnerId: params.partnerId, email, ...data } });
  return { rawToken, userId: user.id, expiresAt };
}

/** Spends an invite link and sets the password. Returns the user so the caller can start a session. */
export async function acceptPartnerInvite(rawToken: string, password: string) {
  if (!rawToken || rawToken.length > 200) throw new PartnerAccountError("invalid_link", "This link is invalid or has expired.");
  if (password.length < PARTNER_PASSWORD_MIN_LENGTH) {
    throw new PartnerAccountError("weak_password", `Password must be at least ${PARTNER_PASSWORD_MIN_LENGTH} characters.`);
  }

  const tokenHash = hashPartnerToken(rawToken);
  const user = await prisma.partnerUser.findUnique({ where: { setPasswordTokenHash: tokenHash } });
  if (!user || !user.setPasswordTokenExpiresAt || user.setPasswordTokenExpiresAt < new Date()) {
    throw new PartnerAccountError("invalid_link", "This link is invalid or has expired. Ask WGC for a new invitation.");
  }
  if (user.disabledAt) throw new PartnerAccountError("disabled", "This account has been disabled.");

  const passwordHash = await hashPassword(password);
  // The link is spent by this conditional update, so two requests racing on it
  // can't both set a password.
  const claimed = await prisma.partnerUser.updateMany({
    where: { id: user.id, setPasswordTokenHash: tokenHash },
    data: {
      passwordHash,
      setPasswordTokenHash: null,
      setPasswordTokenExpiresAt: null,
      lastLoginAt: new Date(),
      authVersion: { increment: 1 },
    },
  });
  if (claimed.count !== 1) throw new PartnerAccountError("invalid_link", "This link is invalid or has expired.");

  return prisma.partnerUser.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, partnerId: true, email: true, authVersion: true } });
}

/** Checks an email and password. Returns the user, or null for any failure (callers must not say which). */
export async function verifyPartnerLogin(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.partnerUser.findUnique({
    where: { email },
    select: { id: true, partnerId: true, email: true, passwordHash: true, disabledAt: true, authVersion: true, partner: { select: { status: true } } },
  });
  if (!user || !user.passwordHash || user.disabledAt || user.partner.status !== "ACTIVE") return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, partnerId: user.partnerId, email: user.email, authVersion: user.authVersion };
}

export const PARTNER_RESET_TTL_MINUTES = 60;

/**
 * Starts a password reset for someone who already has a password. Returns null when there
 * is nothing to reset (unknown email, no password yet, disabled, partner suspended); the
 * caller must answer the same way either way so the form can't be used to find out who has
 * an account. Someone who hasn't accepted their invitation uses that link instead.
 * The link reuses the single-use setup token, so it also ends other sessions when it's used.
 */
export async function createPartnerPasswordReset(emailInput: string): Promise<{ rawToken: string; email: string; name: string | null } | null> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.partnerUser.findUnique({
    where: { email },
    select: { id: true, name: true, passwordHash: true, disabledAt: true, partner: { select: { status: true } } },
  });
  if (!user || !user.passwordHash || user.disabledAt || user.partner.status !== "ACTIVE") return null;

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.partnerUser.update({
    where: { id: user.id },
    data: { setPasswordTokenHash: hashPartnerToken(rawToken), setPasswordTokenExpiresAt: new Date(Date.now() + PARTNER_RESET_TTL_MINUTES * 60 * 1000) },
  });
  return { rawToken, email, name: user.name };
}
