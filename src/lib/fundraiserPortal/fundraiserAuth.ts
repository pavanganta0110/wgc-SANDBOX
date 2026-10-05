import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const FUNDRAISER_SESSION_COOKIE_NAME = "wgc_fundraiser_session";
const LOGIN_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // magic link is short-lived
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, re-request to renew
const SESSION_MAX_AGE_SECONDS = SESSION_EXPIRY_MS / 1000;

function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export async function createFundraiserLoginToken(campaignFundraiserId: string): Promise<string> {
  const { token, tokenHash } = generateToken();
  await prisma.fundraiserLoginToken.create({
    data: { campaignFundraiserId, tokenHash, expiresAt: new Date(Date.now() + LOGIN_TOKEN_EXPIRY_MS) },
  });
  return token;
}

/** Verifies and consumes a login-link token, then establishes a portal session cookie. Single-use: a second exchange of the same token fails. */
export async function consumeFundraiserLoginToken(token: string): Promise<{ ok: true; campaignFundraiserId: string } | { ok: false; error: string }> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.fundraiserLoginToken.findUnique({ where: { tokenHash } });
  if (!record) return { ok: false, error: "This login link is invalid." };
  if (record.consumedAt) return { ok: false, error: "This login link has already been used." };
  if (record.expiresAt < new Date()) return { ok: false, error: "This login link has expired." };

  await prisma.fundraiserLoginToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  await setFundraiserSessionCookie(record.campaignFundraiserId);
  return { ok: true, campaignFundraiserId: record.campaignFundraiserId };
}

async function setFundraiserSessionCookie(campaignFundraiserId: string): Promise<void> {
  const { token, tokenHash } = generateToken();
  await prisma.fundraiserPortalSession.create({
    data: { campaignFundraiserId, tokenHash, expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS) },
  });
  const cookieStore = await cookies();
  cookieStore.set(FUNDRAISER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export class FundraiserAuthError extends Error {}

/** The only way portal routes/pages should resolve who's logged in — deliberately has no path to a merchant User, church staff role, or Finix data; it resolves strictly to a CampaignFundraiser row. */
export async function requireFundraiserSession(): Promise<{ campaignFundraiserId: string; churchId: string; fundraisingCampaignId: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(FUNDRAISER_SESSION_COOKIE_NAME)?.value;
  if (!token) throw new FundraiserAuthError("Not logged in.");

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.fundraiserPortalSession.findUnique({ where: { tokenHash } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) throw new FundraiserAuthError("Session expired or invalid.");

  const fundraiser = await prisma.campaignFundraiser.findUnique({ where: { id: session.campaignFundraiserId }, select: { id: true, churchId: true, fundraisingCampaignId: true } });
  if (!fundraiser) throw new FundraiserAuthError("Fundraiser record no longer exists.");

  void prisma.fundraiserPortalSession.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } }).catch(() => {});

  return { campaignFundraiserId: fundraiser.id, churchId: fundraiser.churchId, fundraisingCampaignId: fundraiser.fundraisingCampaignId };
}

export async function clearFundraiserSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(FUNDRAISER_SESSION_COOKIE_NAME);
}
