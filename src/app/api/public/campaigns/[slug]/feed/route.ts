import { NextResponse } from "next/server";
import { loadPublicCampaignBySlug } from "@/lib/campaigns/loadPublicCampaignData";
import { getPreviewChurchId } from "@/lib/campaigns/campaignPreviewSession";
import { getFundraiserLeaderboard, getTeamLeaderboard } from "@/lib/campaigns/campaignTotals";
import { checkCampaignFeedRateLimit } from "@/lib/campaigns/campaignFeedRateLimit";

/**
 * Public, unauthenticated feed for a campaign's live donation wall — polled
 * every few seconds by the wall display. Returns only public-safe data:
 * anonymity preferences are already resolved by getRecentGifts, so a
 * donor's real name never appears here when they've asked not to be shown.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!checkCampaignFeedRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // A preview request (the campaign's own logged-in staff, checking the
  // wall before publishing) skips the rate limiter's key entirely below by
  // going through the same IP bucket as anyone else — that's intentional,
  // no special-casing needed there. This only affects whether the campaign
  // lookup itself honors a non-ACTIVE status for this specific requester.
  const previewChurchId = await getPreviewChurchId();
  const result = await loadPublicCampaignBySlug(slug, previewChurchId);
  if (!result.ok) {
    if (result.notFound) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ error: result.message }, { status: 410 });
  }
  if (result.view.kind !== "campaign") {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { campaign, church, raisedCents, donorCount, recentGifts } = result.view;

  const leaderboard = campaign.leaderboardEnabled
    ? {
        fundraisers: (await getFundraiserLeaderboard(campaign.churchId, campaign.id)).slice(0, 10),
        teams: (await getTeamLeaderboard(campaign.churchId, campaign.id)).slice(0, 10),
      }
    : null;

  return NextResponse.json(
    {
      name: campaign.name,
      organizationName: church.name,
      logoUrl: church.logoUrl,
      imageUrl: campaign.imageUrl,
      goalAmountCents: campaign.goalAmountCents,
      raisedCents,
      donorCount,
      recentGifts: recentGifts.map((g) => ({
        id: g.id,
        amountCents: g.amountCents,
        donorName: g.donorName ?? "Anonymous",
        message: g.message,
        createdAt: g.createdAt,
      })),
      leaderboard,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
