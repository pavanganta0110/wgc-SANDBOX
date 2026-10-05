import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFundraiserSession, FundraiserAuthError } from "@/lib/fundraiserPortal/fundraiserAuth";

export async function GET() {
  let session;
  try {
    session = await requireFundraiserSession();
  } catch (err) {
    if (err instanceof FundraiserAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const fundraiser = await prisma.campaignFundraiser.findUnique({ where: { id: session.campaignFundraiserId } });
  if (!fundraiser) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    fundraiser: { displayName: fundraiser.displayName, personalStory: fundraiser.personalStory, imageUrl: fundraiser.imageUrl, goalAmountCents: fundraiser.goalAmountCents },
  });
}

/** Never touches anything financial/Finix — only the display fields a fundraiser is allowed to speak for themselves. Gated on the campaign's own fundraiserSelfEditEnabled flag, re-checked here rather than trusted from the client. */
export async function PATCH(req: Request) {
  let session;
  try {
    session = await requireFundraiserSession();
  } catch (err) {
    if (err instanceof FundraiserAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: session.fundraisingCampaignId } });
  if (!campaign?.fundraiserSelfEditEnabled) {
    return NextResponse.json({ error: "This campaign doesn't allow fundraisers to edit their own page." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { displayName, personalStory, imageUrl, goalAmountCents } = body;

  if (displayName !== undefined && (typeof displayName !== "string" || !displayName.trim())) {
    return NextResponse.json({ error: "Display name is required." }, { status: 400 });
  }
  if (goalAmountCents !== undefined && goalAmountCents !== null && (typeof goalAmountCents !== "number" || goalAmountCents < 0)) {
    return NextResponse.json({ error: "Invalid goal amount." }, { status: 400 });
  }

  const updated = await prisma.campaignFundraiser.update({
    where: { id: session.campaignFundraiserId },
    data: {
      ...(displayName !== undefined ? { displayName: String(displayName).trim() } : {}),
      ...(personalStory !== undefined ? { personalStory: personalStory ? String(personalStory).trim() : null } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl ? String(imageUrl).trim() : null } : {}),
      ...(goalAmountCents !== undefined ? { goalAmountCents } : {}),
    },
  });

  return NextResponse.json({ fundraiser: { displayName: updated.displayName, personalStory: updated.personalStory, imageUrl: updated.imageUrl, goalAmountCents: updated.goalAmountCents } });
}
