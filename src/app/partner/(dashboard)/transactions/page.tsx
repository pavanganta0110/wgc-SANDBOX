import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import { TRANSACTION_LIMIT, loadPartnerVolume, parseVolumePeriod } from "@/lib/partners/loadPartnerVolume";
import PeriodPicker from "@/components/partner/PeriodPicker";
import { formatCents } from "@/lib/format";

export const metadata = { title: "Transactions | Partner dashboard" };
export const dynamic = "force-dynamic";

const dateTimeFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });

export default async function PartnerTransactionsPage({ searchParams }: { searchParams: Promise<{ period?: string; client?: string; method?: string }> }) {
  const session = await getPartnerSession({ allowAgent: true });
  if (!session) redirect("/partner/login");
  if (session.partnerType !== "REFERRAL") redirect("/partner/organizations");
  const sp = await searchParams;
  const p = parseVolumePeriod(sp.period);
  const method = sp.method === "CARD" || sp.method === "ACH" ? sp.method : undefined;
  // `client` is only a filter: the loader ignores one outside this partner's (or agent's) own clients.
  const v = await loadPartnerVolume({ partnerId: session.partnerId, agentId: session.agentId, from: p.from, to: p.to, churchId: sp.client, method });
  const agentView = Boolean(session.agentId);
  const hidden: Record<string, string> = { ...(sp.client ? { client: sp.client } : {}), ...(method ? { method } : {}) };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Transactions</h2>
          <p className="text-sm text-slate-500 mt-1">Successful payments from {agentView ? "the clients you brought in" : "your clients"}. Amount, method and status only.</p>
        </div>
        <PeriodPicker action="/partner/transactions" periodKey={p.key} hidden={hidden} />
      </div>

      <form action="/partner/transactions" method="get" className="flex flex-wrap gap-2">
        <input type="hidden" name="period" value={p.key} />
        <select name="client" defaultValue={sp.client ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label="Client">
          <option value="">All clients</option>
          {v.clients.map((c) => <option key={c.churchId} value={c.churchId}>{c.name}</option>)}
        </select>
        <select name="method" defaultValue={method ?? ""} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label="Method">
          <option value="">Card and ACH</option>
          <option value="CARD">Card</option>
          <option value="ACH">ACH</option>
        </select>
        <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Filter</button>
      </form>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Client</th>
              {!agentView && <th className="px-4 py-3 font-semibold">Agent</th>}
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {v.transactions.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-slate-700">{dateTimeFmt.format(new Date(t.createdAt))}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{t.clientName}</td>
                {!agentView && <td className="px-4 py-3 text-slate-600">{t.agentName ?? "No agent"}</td>}
                <td className="px-4 py-3 text-slate-700">{t.method === "ACH" ? "ACH" : t.method === "CARD" ? "Card" : "Other"}</td>
                <td className="px-4 py-3 text-slate-700">Succeeded</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCents(t.amountCents)}</td>
              </tr>
            ))}
            {v.transactions.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>No transactions in this period.</td></tr>}
          </tbody>
        </table>
      </section>
      {v.transactionsTruncated && <p className="text-xs text-slate-500">Showing the latest {TRANSACTION_LIMIT}. Narrow the month or pick a client to see the rest.</p>}
    </div>
  );
}
