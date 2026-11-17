import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import { loadCommission } from "@/lib/partners/loadCommission";
import { resolveAgentView } from "@/lib/partners/partnerPageGuards";
import CommissionStatement from "@/components/partner/CommissionStatement";
import AgentPayoutForm from "@/components/partner/AgentPayoutForm";

export const metadata = { title: "Commission | Partner dashboard" };
export const dynamic = "force-dynamic";

export default async function PartnerCommissionsPage({ searchParams }: { searchParams: Promise<{ asAgent?: string }> }) {
  const session = await getPartnerSession({ allowAgent: true });
  if (!session) redirect("/partner/login");
  if (session.partnerType !== "REFERRAL") redirect("/partner/organizations");

  const view = await resolveAgentView(session, (await searchParams).asAgent);
  // An agent sees only their own commission; partner staff see the partner's share and how it divides.
  const data = await loadCommission(session.partnerId, view.agentId ? { kind: "agent", agentId: view.agentId } : { kind: "partner" });
  if (!data) redirect("/partner/login");

  return (
    <div className="space-y-6">
      {view.previewName && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Previewing what <strong>{view.previewName}</strong> sees when they sign in. <a className="font-semibold underline" href="/partner/team">Back to Team</a>
        </div>
      )}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Commission</h2>
        <p className="text-sm text-slate-500 mt-1">
          {view.agentId
            ? "What you earn from the organizations you brought in."
            : "Your share of the profit from your organizations, and how it divides between your agents and you."}
        </p>
      </div>
      {!view.previewName && (
        <a className="inline-block text-sm text-blue-600 font-semibold hover:underline" href="/api/partner/reports?type=commission">
          Download commission CSV
        </a>
      )}
      <CommissionStatement data={data} />
      {!view.agentId && !session.readOnly && data.agents.length > 0 && (
        <AgentPayoutForm agents={data.agents.map((a) => ({ id: a.id, name: a.name }))} />
      )}
    </div>
  );
}
