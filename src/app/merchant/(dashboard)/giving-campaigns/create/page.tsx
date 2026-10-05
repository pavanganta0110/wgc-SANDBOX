import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GivingCampaignComposer from "@/components/merchant/GivingCampaignComposer";

export default function NewGivingCampaignPage() {
  return (
    <div>
      <Link href="/merchant/giving-campaigns" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Campaigns
      </Link>
      <h2 className="text-lg font-bold text-slate-900 mb-1">New Giving Campaign</h2>
      <p className="text-sm text-slate-500 mb-6">Send a giving link to a list of donors by email, with per-donor tracking.</p>
      <GivingCampaignComposer />
    </div>
  );
}
