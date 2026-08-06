import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Server-trusted attribution for the Six Months Free promotion. The public
 * /six-months-free landing page is the ONLY automatic source of this
 * promotion — a normal /start signup, a query parameter, a hidden form
 * field, localStorage, or a manually-typed promo code must never grant it.
 *
 * Flow: visitor clicks "Start Six Months Free" on /six-months-free ->
 * createPromotionLead() creates a PromotionLead row server-side and returns
 * a random one-time token -> setPromotionLeadCookie() stores ONLY that raw
 * token in a signed-equivalent* HttpOnly cookie (the token itself is
 * high-entropy and single-use, so no separate HMAC signature is needed —
 * only its SHA-256 hash is ever persisted in the database, mirroring the
 * activation-token pattern) -> the onboarding form at /start is a same-origin
 * fetch to /api/onboarding, so the cookie travels automatically ->
 * consumePromotionLeadForSignup() reads and hashes the cookie server-side,
 * looks up the matching unexpired/unconsumed PromotionLead, and links it to
 * the newly-created OnboardingApplication. The promotion is not attached to
 * an organization at this point — Church doesn't exist until Finix
 * approval — it travels via PromotionLead.onboardingApplicationId until
 * provisionChurchAccount() runs post-approval and creates the actual
 * PromotionEntitlement (see webhook approval flow).
 */

export const PROMO_COOKIE_NAME = "wgc_promo_lead";
const TOKEN_BYTES = 32;
const LEAD_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — long enough to finish the onboarding form, short enough to bound abandoned-lead lifetime

export const SIX_MONTHS_FREE_PROMOTION_CODE = "SIX_MONTHS_FREE_2026";
const SIX_MONTHS_FREE_AUTOMATIC_SOURCE = "LANDING_PAGE_SIX_MONTHS_FREE";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Idempotently ensures the Six Months Free Promotion template row exists —
 * safe to call on every /six-months-free page render. Does not overwrite
 * an admin's later edits to the row (only creates if entirely missing).
 */
export async function ensureSixMonthsFreePromotion() {
  const existing = await prisma.promotion.findUnique({ where: { code: SIX_MONTHS_FREE_PROMOTION_CODE } });
  if (existing) return existing;
  return prisma.promotion.create({
    data: {
      code: SIX_MONTHS_FREE_PROMOTION_CODE,
      name: "Six Months Free",
      customerDescription: "Your first six months of the WGC Platform subscription are free — $10/month afterward, automatically, until canceled.",
      durationMonths: 6,
      normalMonthlyAmountCents: 1000,
      active: true,
      automaticEligibilitySource: SIX_MONTHS_FREE_AUTOMATIC_SOURCE,
      allowManualGrantToExistingOrg: false,
      promotionWaivesPlatformFee: true,
      promotionWaivesInvoiceMonthlyFee: false,
      promotionWaivesInvoiceUsageFee: false,
    },
  });
}

export interface CreatePromotionLeadInput {
  organizationName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  campaignSource?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Creates the lead row and returns the raw token — caller must pass this
 * to setPromotionLeadCookie() immediately; the raw value is never stored. */
export async function createPromotionLead(input: CreatePromotionLeadInput): Promise<{ leadId: string; rawToken: string }> {
  const promotion = await ensureSixMonthsFreePromotion();
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(rawToken);

  const lead = await prisma.promotionLead.create({
    data: {
      organizationName: input.organizationName || null,
      contactName: input.contactName || null,
      contactEmail: input.contactEmail || null,
      contactPhone: input.contactPhone || null,
      campaignSource: input.campaignSource || null,
      promotionId: promotion.id,
      tokenHash,
      tokenExpiresAt: new Date(Date.now() + LEAD_EXPIRY_MS),
      status: "LEAD_CAPTURED",
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
    },
  });

  return { leadId: lead.id, rawToken };
}

export async function setPromotionLeadCookie(rawToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PROMO_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(LEAD_EXPIRY_MS / 1000),
  });
}

/**
 * Reads and hashes the promo cookie (if present) and links the matching,
 * still-valid PromotionLead to the just-created OnboardingApplication.
 * Returns null (silently — this is the expected, common case) for every
 * normal signup that never visited /six-months-free, has no cookie, or
 * whose lead already expired/was consumed. Never trusts any other signal
 * (query params, form fields, headers) to attribute a promotion.
 */
export async function consumePromotionLeadForSignup(onboardingApplicationId: string): Promise<{ leadId: string; promotionId: string } | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(PROMO_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const lead = await prisma.promotionLead.findUnique({ where: { tokenHash } });

  // Always clear the cookie once consumed/attempted, whether or not a
  // matching lead was found — a stale/invalid token must never linger and
  // be retried against a later signup attempt.
  cookieStore.delete(PROMO_COOKIE_NAME);

  if (!lead) return null;
  if (lead.consumedAt) return null;
  if (lead.tokenExpiresAt < new Date()) return null;

  await prisma.promotionLead.update({
    where: { id: lead.id },
    data: {
      onboardingApplicationId,
      status: "SIGNUP_STARTED",
      signupStartedAt: new Date(),
      consumedAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  return { leadId: lead.id, promotionId: lead.promotionId };
}

/** Looked up during Finix approval (webhook flow) to find the lead attached
 * to this OnboardingApplication, if any — the trusted link that survives
 * from signup through to organization creation. */
export async function findPromotionLeadByOnboardingApplication(onboardingApplicationId: string) {
  return prisma.promotionLead.findFirst({ where: { onboardingApplicationId } });
}
