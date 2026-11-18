import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { slugifyEventName } from "@/lib/eventRegistration/eventSlug";
import { MAX_BID_CENTS } from "./bidRules";

/** Validation of what an organization types when it sets up an auction and its items. Returns a message to show, or the clean values. */

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const cents = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_BID_CENTS ? (v as number) : null);
const wholeMinutes = (v: unknown, fallback: number, max: number): number | null => {
  if (v === undefined || v === null || v === "") return fallback;
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null;
};

export interface AuctionInput {
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  format: "SILENT" | "LIVE";
  startsAt: Date;
  endsAt: Date;
  autoExtendWindowMinutes: number;
  autoExtendMinutes: number;
  registrationMode: "OPEN" | "APPROVAL";
  paymentWindowHours: number;
  offerNextBidder: boolean;
  goalCents: number | null;
}

export function validateAuctionInput(body: Record<string, unknown>): { ok: true; value: AuctionInput } | { ok: false; error: string } {
  const title = text(body.title, 160);
  if (!title) return { ok: false, error: "Give the auction a title." };
  const startsAt = new Date(String(body.startsAt));
  const endsAt = new Date(String(body.endsAt));
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "Choose when bidding opens." };
  if (Number.isNaN(endsAt.getTime())) return { ok: false, error: "Choose when bidding closes." };
  if (endsAt <= startsAt) return { ok: false, error: "Bidding must close after it opens." };

  const windowMinutes = wholeMinutes(body.autoExtendWindowMinutes, 5, 60);
  const extendMinutes = wholeMinutes(body.autoExtendMinutes, 5, 60);
  if (windowMinutes === null || extendMinutes === null) return { ok: false, error: "Auto-extend minutes must be between 0 and 60." };
  const paymentWindowHours = wholeMinutes(body.paymentWindowHours, 72, 720);
  if (paymentWindowHours === null || paymentWindowHours < 1) return { ok: false, error: "Give winners between 1 and 720 hours to pay." };

  let goalCents: number | null = null;
  if (body.goalCents !== undefined && body.goalCents !== null && body.goalCents !== "") {
    goalCents = cents(body.goalCents);
    if (goalCents === null) return { ok: false, error: "The goal must be a whole number of cents." };
  }

  return {
    ok: true,
    value: {
      title,
      description: text(body.description, 5000),
      coverImageUrl: text(body.coverImageUrl, 500),
      format: body.format === "LIVE" ? "LIVE" : "SILENT",
      startsAt,
      endsAt,
      autoExtendWindowMinutes: windowMinutes,
      autoExtendMinutes: extendMinutes,
      registrationMode: body.registrationMode === "APPROVAL" ? "APPROVAL" : "OPEN",
      paymentWindowHours,
      offerNextBidder: body.offerNextBidder !== false,
      goalCents,
    },
  };
}

export interface ItemInput {
  title: string;
  description: string | null;
  imageUrl: string | null;
  startingBidCents: number;
  minIncrementCents: number;
  fairMarketValueCents: number;
  donatedBy: string | null;
  category: string | null;
}

export function validateItemInput(body: Record<string, unknown>): { ok: true; value: ItemInput } | { ok: false; error: string } {
  const title = text(body.title, 160);
  if (!title) return { ok: false, error: "Give the item a title." };
  const startingBidCents = cents(body.startingBidCents);
  if (startingBidCents === null || startingBidCents < 100) return { ok: false, error: "The starting bid must be at least $1.00." };
  const minIncrementCents = body.minIncrementCents === undefined ? 500 : cents(body.minIncrementCents);
  if (minIncrementCents === null || minIncrementCents < 100) return { ok: false, error: "The minimum raise must be at least $1.00." };
  // Required and explicit: it decides how much of the winner's payment is a charitable gift on their receipt.
  const fairMarketValueCents = cents(body.fairMarketValueCents);
  if (fairMarketValueCents === null) return { ok: false, error: "Enter the fair market value (what the item is worth). Enter 0 only if the winner receives nothing of value." };
  return { ok: true, value: { title, description: text(body.description, 5000), imageUrl: text(body.imageUrl, 500), startingBidCents, minIncrementCents, fairMarketValueCents, donatedBy: text(body.donatedBy, 160), category: text(body.category, 80) } };
}

/** Public slugs are global: a short random suffix keeps two organizations' "Spring Gala" apart and the URL unguessable while it is a draft. */
export async function generateAuctionSlug(title: string): Promise<string> {
  const base = slugifyEventName(title);
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = `${base}-${crypto.randomBytes(3).toString("hex")}`;
    if (!(await prisma.auction.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${crypto.randomBytes(6).toString("hex")}`;
}
