import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFundraiserSession, FundraiserAuthError } from "@/lib/fundraiserPortal/fundraiserAuth";
import { getFundraiserRaisedCents, getDonorCount, getFundraiserLeaderboard, getRecentGifts } from "@/lib/campaigns/campaignTotals";
import { formatCents } from "@/lib/format";
import ProgressBar from "@/components/campaigns/ProgressBar";
import RecentGiftsList from "@/components/campaigns/RecentGiftsList";
import FundraiserLogoutButton from "@/components/fundraiser/FundraiserLogoutButton";

export default async function FundraiserPortalPage() {
  let session;
  try {
    session = await requireFundraiserSession();
  } catch (err) {
    if (err instanceof FundraiserAuthError) redirect("/fundraiser/login");
    throw err;
  }

  const fundraiser = await prisma.campaignFundraiser.findUnique({ where: { id: session.campaignFundraiserId } });
  if (!fundraiser) redirect("/fundraiser/login");

  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: session.fundraisingCampaignId } });
  if (!campaign) redirect("/fundraiser/login");

  const team = fundraiser.campaignTeamId ? await prisma.campaignTeam.findUnique({ where: { id: fundraiser.campaignTeamId } }) : null;

  const [raisedCents, donorCount, leaderboard, recentGifts] = await Promise.all([
    getFundraiserRaisedCents(session.churchId, fundraiser.id),
    getDonorCount(session.churchId, { campaignFundraiserId: fundraiser.id }),
    getFundraiserLeaderboard(session.churchId, campaign.id, fundraiser.campaignTeamId ?? undefined),
    getRecentGifts(session.churchId, { campaignFundraiserId: fundraiser.id }, 10),
  ]);

  const rank = leaderboard.findIndex((e) => e.id === fundraiser.id) + 1;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  const shareUrl = `${appUrl}/f/${fundraiser.slug}`;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-indigo-600 font-bold">{campaign.name}{team ? ` · ${team.name}` : ""}</p>
            <h1 className="text-xl font-bold text-slate-900">Hi, {fundraiser.displayName}</h1>
          </div>
          <FundraiserLogoutButton />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <ProgressBar raisedCents={raisedCents} goalAmountCents={fundraiser.goalAmountCents} donorCount={donorCount} />
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{rank > 0 ? `#${rank}` : "—"}</p>
              <p className="text-xs text-slate-500">{team ? "Team Rank" : "Campaign Rank"}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{formatCents(raisedCents)}</p>
              <p className="text-xs text-slate-500">Raised</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Your Fundraising Page</h2>
          <div className="flex items-center gap-2">
            <input readOnly value={shareUrl} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 bg-slate-50" />
            <Link href={`/f/${fundraiser.slug}`} target="_blank" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white whitespace-nowrap">
              View Page
            </Link>
          </div>
          {campaign.fundraiserSelfEditEnabled && (
            <Link href="/fundraiser/edit" className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
              Edit my story, goal, and photo &rarr;
            </Link>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Recent Gifts</h2>
          <RecentGiftsList gifts={recentGifts.map((g) => ({ id: g.id, amountCents: g.amountCents, donorName: g.donorName ?? "Anonymous", message: g.message, createdAt: g.createdAt }))} />
        </div>
      </div>
    </div>
  );
}
