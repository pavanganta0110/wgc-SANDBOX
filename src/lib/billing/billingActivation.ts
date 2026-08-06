import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Single-purpose, single-organization, hashed, expiring, revocable tokens
 * gating /activate-subscription/[token]. The raw token is only ever
 * returned once (to be emailed) — never persisted; only its SHA-256 hash
 * is stored, mirroring the existing onboarding update-request token
 * pattern already used elsewhere in this codebase.
 */

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — long enough for an owner to complete billing setup without rushing, short enough to bound a stale link's lifetime

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a new activation token for the organization, revoking any
 * previously-issued unconsumed token first (at most one live token per
 * organization) — safe to call repeatedly for "resend activation email."
 */
export async function createBillingActivationToken(organizationId: string): Promise<string> {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(rawToken);

  await prisma.$transaction([
    prisma.billingActivationToken.updateMany({
      where: { organizationId, consumedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.billingActivationToken.create({
      data: { organizationId, tokenHash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    }),
  ]);

  return rawToken;
}

export interface ResolvedActivationToken {
  tokenId: string;
  organizationId: string;
}

/** Validates a raw token without consuming it — safe to call on every page
 * load of /activate-subscription/[token] (the setup flow may take several
 * visits). Returns null for any invalid/expired/revoked/consumed token. */
export async function resolveBillingActivationToken(rawToken: string): Promise<ResolvedActivationToken | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const token = await prisma.billingActivationToken.findUnique({ where: { tokenHash } });
  if (!token) return null;
  if (token.revokedAt) return null;
  if (token.consumedAt) return null;
  if (token.expiresAt < new Date()) return null;
  return { tokenId: token.id, organizationId: token.organizationId };
}

/** Marks the token consumed once the subscription it gated has actually
 * been created successfully — never before. */
export async function consumeBillingActivationToken(tokenId: string): Promise<void> {
  await prisma.billingActivationToken.update({ where: { id: tokenId }, data: { consumedAt: new Date() } });
}

export async function revokeBillingActivationTokens(organizationId: string): Promise<void> {
  await prisma.billingActivationToken.updateMany({
    where: { organizationId, consumedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
