import { randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/donors/donorContact";

const LOGIN_CODE_EXPIRY_MS = 15 * 60 * 1000;
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_SECONDS = SESSION_EXPIRY_MS / 1000;
const MAX_FAILED_ATTEMPTS = 5;
// Per donor, not per IP — stops someone from flooding a donor's inbox even
// when they rotate addresses. The route adds its own per-IP limit on top.
const MAX_CODES_PER_WINDOW = 3;
const CODE_ISSUE_WINDOW_MS = 10 * 60 * 1000;

/** One cookie per organization, so signing in to a second church never evicts the first church's session. */
export function donorSessionCookieName(churchSlug: string): string {
  return `wgc_donor_${churchSlug}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashCode(code: string, linkTokenHash: string): string {
  return createHmac("sha256", linkTokenHash).update(code).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Active (not archived, not merged away) donors at this church sharing an email — the only records a portal session may ever read. */
export async function findPortalDonorsByEmail(churchId: string, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  return prisma.donor.findMany({
    where: { churchId, normalizedEmail: normalized, archivedAt: null, mergedIntoDonorId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, normalizedEmail: true },
  });
}

export type IssueLoginCodeResult =
  | { issued: true; code: string; linkToken: string; donor: { id: string; name: string | null; email: string | null } }
  | { issued: false };

/** Never reveals why nothing was issued (no match vs. throttled) — callers must return the same generic response either way. */
export async function issueDonorLoginCode(churchId: string, email: string): Promise<IssueLoginCodeResult> {
  const donors = await findPortalDonorsByEmail(churchId, email);
  const donor = donors[0];
  if (!donor || !donor.email) return { issued: false };

  const recent = await prisma.donorLoginCode.count({
    where: { churchId, donorId: donor.id, createdAt: { gte: new Date(Date.now() - CODE_ISSUE_WINDOW_MS) } },
  });
  if (recent >= MAX_CODES_PER_WINDOW) return { issued: false };

  // Only the newest code is ever valid.
  await prisma.donorLoginCode.updateMany({
    where: { churchId, donorId: donor.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const linkToken = randomBytes(32).toString("hex");
  const linkTokenHash = sha256(linkToken);

  await prisma.donorLoginCode.create({
    data: {
      churchId,
      donorId: donor.id,
      codeHash: hashCode(code, linkTokenHash),
      linkTokenHash,
      expiresAt: new Date(Date.now() + LOGIN_CODE_EXPIRY_MS),
    },
  });

  return { issued: true, code, linkToken, donor: { id: donor.id, name: donor.name, email: donor.email } };
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

const INVALID_CODE_ERROR = "That code is invalid or has expired. Request a new one.";

/** Verifies a typed 6-digit code for this church's donor and, on success, starts a session cookie. */
export async function verifyDonorLoginCode(churchId: string, churchSlug: string, email: string, code: string): Promise<VerifyResult> {
  const donors = await findPortalDonorsByEmail(churchId, email);
  const donor = donors[0];
  if (!donor || !/^\d{6}$/.test(code)) return { ok: false, error: INVALID_CODE_ERROR };

  const record = await prisma.donorLoginCode.findFirst({
    where: { churchId, donorId: donor.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.failedAttempts >= MAX_FAILED_ATTEMPTS) return { ok: false, error: INVALID_CODE_ERROR };

  if (!safeEqualHex(record.codeHash, hashCode(code, record.linkTokenHash))) {
    await prisma.donorLoginCode.update({ where: { id: record.id }, data: { failedAttempts: { increment: 1 } } });
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  // updateMany + count guards against two requests redeeming the same code.
  const consumed = await prisma.donorLoginCode.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) return { ok: false, error: INVALID_CODE_ERROR };

  await startDonorSession(churchId, churchSlug, donor.id);
  return { ok: true };
}

/** Verifies the emailed one-tap link token. The link's own row carries the church, so a link can never open a different organization. */
export async function consumeDonorLoginLink(churchId: string, churchSlug: string, linkToken: string): Promise<VerifyResult> {
  const record = await prisma.donorLoginCode.findUnique({ where: { linkTokenHash: sha256(linkToken) } });
  if (!record || record.churchId !== churchId || record.consumedAt || record.expiresAt < new Date()) {
    return { ok: false, error: "This sign-in link is invalid or has expired." };
  }

  const consumed = await prisma.donorLoginCode.updateMany({ where: { id: record.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) return { ok: false, error: "This sign-in link has already been used." };

  await startDonorSession(churchId, churchSlug, record.donorId);
  return { ok: true };
}

async function startDonorSession(churchId: string, churchSlug: string, donorId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await prisma.donorPortalSession.create({
    data: { churchId, donorId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS) },
  });
  const cookieStore = await cookies();
  cookieStore.set(donorSessionCookieName(churchSlug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export class DonorAuthError extends Error {}

export interface DonorSession {
  sessionId: string;
  churchId: string;
  churchSlug: string;
  churchName: string;
  donorId: string;
}

/**
 * The only way portal routes/pages resolve who is signed in. The church is
 * resolved from the URL slug server-side, and the session's own churchId must
 * match it — a cookie from one organization is worthless at another. Has no
 * path to a merchant User, staff role, or any Finix call.
 */
export async function requireDonorSession(churchSlug: string): Promise<DonorSession> {
  const church = await prisma.church.findUnique({ where: { slug: churchSlug }, select: { id: true, name: true, slug: true } });
  if (!church) throw new DonorAuthError("Organization not found.");

  const cookieStore = await cookies();
  const token = cookieStore.get(donorSessionCookieName(church.slug))?.value;
  if (!token) throw new DonorAuthError("Not signed in.");

  const session = await prisma.donorPortalSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.revokedAt || session.expiresAt < new Date() || session.churchId !== church.id) {
    throw new DonorAuthError("Session expired or invalid.");
  }

  void prisma.donorPortalSession.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } }).catch(() => {});

  return { sessionId: session.id, churchId: church.id, churchSlug: church.slug, churchName: church.name, donorId: session.donorId };
}

export async function endDonorSession(churchSlug: string): Promise<void> {
  const cookieStore = await cookies();
  const name = donorSessionCookieName(churchSlug);
  const token = cookieStore.get(name)?.value;
  if (token) {
    await prisma.donorPortalSession.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  cookieStore.delete(name);
}
