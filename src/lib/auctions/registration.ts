import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BIDDER_CODE_RESEND_GAP_MS,
  BIDDER_CODE_TTL_MS,
  BIDDER_MAX_CODE_ATTEMPTS,
  cleanName,
  cleanPhone,
  generateBidderCode,
  hashBidderCode,
  hashSessionToken,
  newSessionToken,
  normalizeEmail,
  readBidderCookie,
  safeEqualHex,
} from "./bidderIdentity";
import { sendBidderApprovedEmail, sendBidderCodeEmail, sendBidderDeclinedEmail } from "./auctionEmails";

/**
 * Bidder registration: apply (name, email, phone), prove the email with a one-time code, then bid. The same two
 * steps sign a returning bidder back in. For an auction with approval, a verified registration waits for the
 * organization to approve it; otherwise it is approved on the spot and given a bidder number.
 */

interface AuctionRef {
  id: string;
  churchId: string;
  title: string;
  slug: string;
  registrationMode: string;
}

/**
 * Step 1. Creates the registration if new and emails a fresh code. The answer never says whether the email was
 * already registered, so this cannot be used to find out who is on a list.
 */
export async function requestBidderCode(params: { auction: AuctionRef; name: unknown; email: unknown; phone: unknown; now?: Date }): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = params.now ?? new Date();
  const email = normalizeEmail(params.email);
  const name = cleanName(params.name);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  if (!name) return { ok: false, error: "Enter your name." };
  const phone = cleanPhone(params.phone);
  const { auction } = params;

  let bidder = await prisma.auctionBidder.findUnique({ where: { auctionId_normalizedEmail: { auctionId: auction.id, normalizedEmail: email } } });
  if (!bidder) {
    try {
      bidder = await prisma.auctionBidder.create({
        data: { churchId: auction.churchId, auctionId: auction.id, name, email, normalizedEmail: email, phone },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        bidder = await prisma.auctionBidder.findUnique({ where: { auctionId_normalizedEmail: { auctionId: auction.id, normalizedEmail: email } } });
      } else {
        throw err;
      }
    }
  }
  if (!bidder || bidder.status === "BLOCKED") return { ok: true }; // silent: a blocked person learns nothing

  // One code a minute per registration, so this cannot be used to flood someone's inbox.
  if (bidder.verifyCodeExpiresAt && bidder.verifyCodeExpiresAt.getTime() - BIDDER_CODE_TTL_MS > now.getTime() - BIDDER_CODE_RESEND_GAP_MS) return { ok: true };

  const code = generateBidderCode();
  await prisma.auctionBidder.update({
    where: { id: bidder.id },
    data: { verifyCodeHash: hashBidderCode(code, auction.id, email), verifyCodeExpiresAt: new Date(now.getTime() + BIDDER_CODE_TTL_MS), verifyAttempts: 0 },
  });
  await sendBidderCodeEmail({ churchId: auction.churchId, auctionId: auction.id, auctionTitle: auction.title, to: bidder.email, recipientName: bidder.name, code });
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; bidderId: string; sessionToken: string; status: string; bidderNumber: number | null }
  | { ok: false; error: string };

/** Step 2. Checks the code and signs the bidder in (a session token for the cookie). */
export async function verifyBidderCode(params: { auction: AuctionRef; email: unknown; code: unknown; now?: Date }): Promise<VerifyResult> {
  const now = params.now ?? new Date();
  const email = normalizeEmail(params.email);
  const code = typeof params.code === "string" ? params.code.trim() : "";
  const generic = { ok: false as const, error: "That code didn't work. Check it, or ask for a new one." };
  if (!email || !/^\d{6}$/.test(code)) return generic;
  const { auction } = params;

  const bidder = await prisma.auctionBidder.findUnique({ where: { auctionId_normalizedEmail: { auctionId: auction.id, normalizedEmail: email } } });
  if (!bidder || bidder.status === "BLOCKED" || !bidder.verifyCodeHash || !bidder.verifyCodeExpiresAt) return generic;
  if (bidder.verifyCodeExpiresAt <= now || bidder.verifyAttempts >= BIDDER_MAX_CODE_ATTEMPTS) return generic;

  if (!safeEqualHex(hashBidderCode(code, auction.id, email), bidder.verifyCodeHash)) {
    await prisma.auctionBidder.update({ where: { id: bidder.id }, data: { verifyAttempts: { increment: 1 } } });
    return generic;
  }

  const session = newSessionToken();
  await prisma.auctionBidder.update({
    where: { id: bidder.id },
    data: { emailVerifiedAt: bidder.emailVerifiedAt ?? now, verifyCodeHash: null, verifyCodeExpiresAt: null, verifyAttempts: 0, sessionTokenHash: session.hash },
  });

  let status = bidder.status;
  let bidderNumber = bidder.bidderNumber;
  if (auction.registrationMode === "OPEN" && status === "PENDING") {
    bidderNumber = await approveBidder({ auction, bidderId: bidder.id, sendEmail: false });
    status = "APPROVED";
  }
  return { ok: true, bidderId: bidder.id, sessionToken: session.token, status, bidderNumber };
}

/** The signed-in bidder for a request, or null. The cookie holds the bidder id and a token; only the token's hash is stored. */
export async function resolveBidderSession(cookieHeader: string | null, auction: { id: string; churchId: string }) {
  const cookie = readBidderCookie(cookieHeader, auction.id);
  if (!cookie) return null;
  const bidder = await prisma.auctionBidder.findFirst({ where: { id: cookie.bidderId, auctionId: auction.id, churchId: auction.churchId } });
  if (!bidder || !bidder.emailVerifiedAt || bidder.status === "BLOCKED") return null;
  return safeEqualHex(hashSessionToken(cookie.token), bidder.sessionTokenHash) ? bidder : null;
}

/** Gives the bidder the next free number in this auction. Two at once cannot share one: the unique key decides and the loser retries. */
async function assignBidderNumber(auctionId: string, bidderId: string): Promise<number> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const top = await prisma.auctionBidder.aggregate({ where: { auctionId }, _max: { bidderNumber: true } });
    const next = (top._max.bidderNumber ?? 99) + 1; // numbers start at 100, like paddles
    try {
      await prisma.auctionBidder.update({ where: { id: bidderId }, data: { bidderNumber: next } });
      return next;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not assign a bidder number.");
}

/** Approves a bidder (assigning a number the first time) and optionally tells them. Safe to call again. */
export async function approveBidder(params: { auction: AuctionRef; bidderId: string; sendEmail: boolean }): Promise<number> {
  const { auction, bidderId } = params;
  const bidder = await prisma.auctionBidder.findFirst({ where: { id: bidderId, auctionId: auction.id, churchId: auction.churchId } });
  if (!bidder) throw new Error("Bidder not found.");
  const number = bidder.bidderNumber ?? (await assignBidderNumber(auction.id, bidder.id));
  const wasApproved = bidder.status === "APPROVED";
  await prisma.auctionBidder.update({ where: { id: bidder.id }, data: { status: "APPROVED" } });
  if (params.sendEmail && !wasApproved) {
    await sendBidderApprovedEmail({ churchId: auction.churchId, auctionId: auction.id, auctionTitle: auction.title, slug: auction.slug, to: bidder.email, recipientName: bidder.name, bidderNumber: number });
  }
  return number;
}

export async function declineBidder(params: { auction: AuctionRef; bidderId: string; sendEmail: boolean }): Promise<void> {
  const { auction, bidderId } = params;
  const bidder = await prisma.auctionBidder.findFirst({ where: { id: bidderId, auctionId: auction.id, churchId: auction.churchId } });
  if (!bidder) throw new Error("Bidder not found.");
  await prisma.auctionBidder.update({ where: { id: bidder.id }, data: { status: "DECLINED" } });
  if (params.sendEmail) {
    await sendBidderDeclinedEmail({ churchId: auction.churchId, auctionId: auction.id, auctionTitle: auction.title, to: bidder.email, recipientName: bidder.name });
  }
}

export async function blockBidder(params: { auction: AuctionRef; bidderId: string }): Promise<void> {
  // Blocking also ends their session, so they are out straight away.
  await prisma.auctionBidder.updateMany({
    where: { id: params.bidderId, auctionId: params.auction.id, churchId: params.auction.churchId },
    data: { status: "BLOCKED", sessionTokenHash: null },
  });
}

/** Staff add someone at the event. They are approved at once; they still verify their email before they can bid online. */
export async function addBidderByStaff(params: { auction: AuctionRef; name: unknown; email: unknown; phone: unknown; userId: string }): Promise<{ ok: true; bidderId: string; bidderNumber: number } | { ok: false; error: string }> {
  const email = normalizeEmail(params.email);
  const name = cleanName(params.name);
  if (!email) return { ok: false, error: "A valid email is required, so the winner can be sent their invoice." };
  if (!name) return { ok: false, error: "A name is required." };
  const { auction } = params;

  try {
    const created = await prisma.auctionBidder.create({
      data: { churchId: auction.churchId, auctionId: auction.id, name, email, normalizedEmail: email, phone: cleanPhone(params.phone), addedByUserId: params.userId },
    });
    const bidderNumber = await approveBidder({ auction, bidderId: created.id, sendEmail: false });
    return { ok: true, bidderId: created.id, bidderNumber };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "That email is already registered for this auction." };
    }
    throw err;
  }
}
