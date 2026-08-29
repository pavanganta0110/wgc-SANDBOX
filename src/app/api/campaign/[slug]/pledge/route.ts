import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { isValidEmail, normalizeUSPhone } from "@/lib/validation";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { checkPublicPledgeRateLimit } from "@/lib/pledges/publicPledgeRateLimit";

/**
 * Public, unauthenticated "make a pledge" endpoint for a published
 * campaign page (/campaign/[slug]) — records a promise only, never touches
 * Finix or moves money. Donor identity uses the same exact-match
 * resolveOrCreateDonor the public /g/[slug] donate route uses (not the
 * merchant-side match-review variant, which is for merchant-entered/import
 * flows where a human reviews fuzzy matches).
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkPublicPledgeRateLimit(`pledge:${ip}`)) {
    return toSafeErrorResponse("Too many requests. Please try again in a minute.", 429);
  }

  try {
    const campaign = await prisma.pledgeCampaign.findUnique({ where: { publicSlug: slug } });
    if (!campaign || campaign.status !== "ACTIVE") {
      return toSafeErrorResponse("This campaign is not currently accepting pledges", 404);
    }

    const body = await req.json().catch(() => ({}));
    const { name, email, phone, isAnonymous, pledgeAmountCents, unitCount, notes } = body;

    let resolvedAmountCents = pledgeAmountCents;
    if (campaign.unitAmountCents != null && unitCount != null) {
      if (!Number.isFinite(unitCount) || unitCount <= 0) {
        return toSafeErrorResponse("Please enter a valid quantity", 400);
      }
      resolvedAmountCents = Math.round(campaign.unitAmountCents * unitCount);
    }
    if (!Number.isFinite(resolvedAmountCents) || resolvedAmountCents <= 0) {
      return toSafeErrorResponse("Please enter a valid pledge amount", 400);
    }

    let donorId: string | null = null;
    let donorMatchStatus = "ANONYMOUS";
    if (!isAnonymous) {
      const trimmedName = typeof name === "string" ? name.trim() : "";
      const trimmedEmail = typeof email === "string" ? email.trim() : "";
      if (!trimmedName || !trimmedEmail) {
        return toSafeErrorResponse("Name and email are required", 400);
      }
      if (!isValidEmail(trimmedEmail)) {
        return toSafeErrorResponse("Please enter a valid email address", 400);
      }
      const normalizedPhone = typeof phone === "string" ? normalizeUSPhone(phone) : null;

      const donorRecord = await resolveOrCreateDonor({
        churchId: campaign.churchId,
        name: trimmedName,
        email: trimmedEmail,
        phone: normalizedPhone || null,
      });
      donorId = donorRecord.id;
      donorMatchStatus = "MATCHED";
    }

    const pledge = await prisma.pledge.create({
      data: {
        churchId: campaign.churchId,
        pledgeCampaignId: campaign.id,
        donorId,
        donorMatchStatus,
        isAnonymous: Boolean(isAnonymous),
        pledgeAmountCents: resolvedAmountCents,
        unitCount: unitCount ?? null,
        notes: typeof notes === "string" ? notes.trim().slice(0, 1000) || null : null,
        source: "DONOR_SELF_SERVICE",
      },
    });

    return NextResponse.json({ success: true, pledgeId: pledge.id });
  } catch (error) {
    return toSafeErrorResponse(error, 500, { route: "/api/campaign/[slug]/pledge", action: "CREATE_PUBLIC_PLEDGE" });
  }
}
