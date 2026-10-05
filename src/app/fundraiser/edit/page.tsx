import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFundraiserSession, FundraiserAuthError } from "@/lib/fundraiserPortal/fundraiserAuth";
import FundraiserEditForm from "@/components/fundraiser/FundraiserEditForm";

export default async function FundraiserEditPage() {
  let session;
  try {
    session = await requireFundraiserSession();
  } catch (err) {
    if (err instanceof FundraiserAuthError) redirect("/fundraiser/login");
    throw err;
  }

  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: session.fundraisingCampaignId } });
  if (!campaign?.fundraiserSelfEditEnabled) redirect("/fundraiser");

  const fundraiser = await prisma.campaignFundraiser.findUnique({ where: { id: session.campaignFundraiserId } });
  if (!fundraiser) redirect("/fundraiser/login");

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <Link href="/fundraiser" className="text-sm text-indigo-600 hover:underline">
          &larr; Back
        </Link>
        <h1 className="text-lg font-bold text-slate-900 mt-2 mb-6">Edit Your Fundraiser Page</h1>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <FundraiserEditForm
            initial={{ displayName: fundraiser.displayName, personalStory: fundraiser.personalStory, imageUrl: fundraiser.imageUrl, goalAmountCents: fundraiser.goalAmountCents }}
          />
        </div>
      </div>
    </div>
  );
}
