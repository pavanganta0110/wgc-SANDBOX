import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { getFundraiserLeaderboard, getTeamLeaderboard } from "@/lib/campaigns/campaignTotals";

export async function GET(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewFundraisingCampaigns");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const campaign = await prisma.fundraisingCampaign.findFirst({
    where: { id: campaignId, churchId: auth.churchId },
    select: { id: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const [fundraisers, teams] = await Promise.all([
    getFundraiserLeaderboard(auth.churchId, campaignId),
    getTeamLeaderboard(auth.churchId, campaignId),
  ]);

  return NextResponse.json({ fundraisers, teams });
}
