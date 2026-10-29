import PartnerTeamPanel from "@/components/partner/PartnerTeamPanel";

export const metadata = { title: "Team | Partner dashboard" };

export default function PartnerTeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Team</h2>
        <p className="text-sm text-slate-500 mt-1">The people who can sign in to your partner account.</p>
      </div>
      <PartnerTeamPanel />
    </div>
  );
}
