import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import { loadCommission } from "@/lib/partners/loadCommission";
import CommissionStatement from "@/components/partner/CommissionStatement";
import AgentPayoutForm from "@/components/partner/AgentPayoutForm";

export const metadata = { title: "Commission | Partner dashboard" };
export const dynamic = "force-dynamic";

export default async function PartnerCommissionsPage() {
  const session = await getPartnerSession({ allowAgent: true });
  if (!session) redirect("/partner/login");
  if (session.partnerType !== "REFERRAL") redirect("/partner/organizations");

  // An agent sees only their own commission; partner staff see the partner's share and how it divides.
  const data = await loadCommission(session.partnerId, session.agentId ? { kind: "agent", agentId: session.agentId } : { kind: "partner" });
  if (!data) redirect("/partner/login");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Commission</h2>
        <p className="text-sm text-slate-500 mt-1">
          {session.agentId
            ? "What you earn from the organizations you brought in."
            : "Your share of the profit from your organizations, and how it divides between your agents and you."}
        </p>
      </div>
      <CommissionStatement data={data} />
      {!session.agentId && !session.readOnly && data.agents.length > 0 && (
        <AgentPayoutForm agents={data.agents.map((a) => ({ id: a.id, name: a.name }))} />
      )}
    </div>
  );
}
