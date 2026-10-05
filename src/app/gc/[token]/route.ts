import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CAMPAIGN_REF_COOKIE = "wgc_campaign_ref";
// Generous enough to cover someone clicking a link, getting distracted, and
// coming back to actually give later the same sitting — but not so long
// that a shared/public device keeps attributing donations to whoever
// clicked the original link days ago.
const CAMPAIGN_REF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2;

/**
 * A campaign recipient's personal link — /gc/{token}, never the giving
 * link's own URL directly. Records the first click, then forwards to the
 * real /g/[slug] page with a short-lived cookie naming this recipient, so
 * /api/g/[slug]/donate can attribute an eventual payment back to them (see
 * that route's own campaign-attribution block). Public/unauthenticated by
 * design — this is the link a donor clicks from a text or email.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const recipient = await prisma.givingCampaignRecipient.findUnique({ where: { trackingToken: token } });
  if (!recipient) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const campaign = await prisma.givingCampaign.findFirst({ where: { id: recipient.campaignId, churchId: recipient.churchId } });
  if (!campaign) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const link = await prisma.givingLink.findFirst({ where: { id: campaign.givingLinkId, churchId: recipient.churchId }, select: { publicSlug: true } });
  if (!link) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!recipient.clickedAt) {
    await prisma.givingCampaignRecipient.update({ where: { id: recipient.id }, data: { clickedAt: new Date() } });
  }

  const response = NextResponse.redirect(new URL(`/g/${encodeURIComponent(link.publicSlug)}`, req.url));
  response.cookies.set(CAMPAIGN_REF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CAMPAIGN_REF_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
