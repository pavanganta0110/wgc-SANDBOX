import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import { resolveAgentView } from "@/lib/partners/partnerPageGuards";
import { loadPartnerOnboarding } from "@/lib/partners/loadPartnerOnboarding";

export const metadata = { title: "Applications | Partner dashboard" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const stageStyle: Record<string, string> = {
  submitted: "bg-blue-50 text-blue-700",
  under_review: "bg-blue-50 text-blue-700",
  information_required: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  failed: "bg-red-50 text-red-700",
  draft: "bg-slate-100 text-slate-600",
};

export default async function PartnerApplicationsPage({ searchParams }: { searchParams: Promise<{ asAgent?: string }> }) {
  const session = await getPartnerSession({ allowAgent: true, allowViewer: true });
  if (!session) redirect("/partner/login");
  if (session.partnerType !== "REFERRAL") redirect("/partner/organizations");
  const { asAgent } = await searchParams;
  const view = await resolveAgentView(session, asAgent);
  // Scope comes from the session (or a validated preview), never from the URL: an agent sees only their own applications.
  const rows = await loadPartnerOnboarding(session.partnerId, 200, view.agentId);
  const agentView = Boolean(view.agentId);

  return (
    <div className="space-y-6">
      {view.previewName && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Previewing what <strong>{view.previewName}</strong> sees when they sign in. <a className="font-semibold underline" href="/partner/team">Back to Team</a>
        </div>
      )}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Applications</h2>
        <p className="text-sm text-slate-500 mt-1">
          {agentView ? "Where each application you brought in stands." : "Where each application stands, and which agent brought it in."} You are also emailed each time one changes: submitted, under review, information required, approved or not approved.
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">Organization</th>
              {!agentView && <th className="px-4 py-3 font-semibold">Brought by</th>}
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Submitted</th>
              <th className="px-4 py-3 font-semibold">Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="px-4 py-3 font-semibold text-slate-900">{r.organizationName}</td>
                {!agentView && <td className="px-4 py-3 text-slate-600">{r.agent?.name ?? "No agent"}</td>}
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${stageStyle[r.stage] ?? stageStyle.draft}`}>{r.stageLabel}</span>
                  {r.requestedItems.length > 0 && (
                    <ul className="mt-2 list-disc pl-4 text-xs text-slate-600 space-y-1">
                      {r.requestedItems.map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.submittedAt ? dateFmt.format(new Date(r.submittedAt)) : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{r.approvedAt ? `Approved ${dateFmt.format(new Date(r.approvedAt))}` : r.rejectedAt ? `Not approved ${dateFmt.format(new Date(r.rejectedAt))}` : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={agentView ? 4 : 5} className="px-4 py-6 text-center text-slate-500">No applications yet. They appear here as soon as someone applies through your link.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
