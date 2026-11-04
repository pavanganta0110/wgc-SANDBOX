import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import { loadPartnerVolume, parseVolumePeriod } from "@/lib/partners/loadPartnerVolume";
import PeriodPicker from "@/components/partner/PeriodPicker";
import { formatCents } from "@/lib/format";

export const metadata = { title: "Volume | Partner dashboard" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </div>
  );
}

export default async function PartnerVolumePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const session = await getPartnerSession({ allowAgent: true });
  if (!session) redirect("/partner/login");
  const { period } = await searchParams;
  const p = parseVolumePeriod(period);
  // Scope comes from the session only: an agent gets only the clients they brought in.
  const v = await loadPartnerVolume({ partnerId: session.partnerId, agentId: session.agentId, from: p.from, to: p.to });
  const agentView = Boolean(session.agentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Volume</h2>
          <p className="text-sm text-slate-500 mt-1">{agentView ? "What the clients you brought in have processed." : "What your clients have processed, and which agent brought each one."}</p>
        </div>
        <PeriodPicker action="/partner/volume" periodKey={p.key} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total volume" value={formatCents(v.total.amountCents)} note={`${v.total.count.toLocaleString("en-US")} transactions`} />
        <Tile label="Card" value={formatCents(v.card.amountCents)} note={`${v.card.count.toLocaleString("en-US")} transactions`} />
        <Tile label="ACH" value={formatCents(v.ach.amountCents)} note={`${v.ach.count.toLocaleString("en-US")} transactions`} />
        <Tile label="Refunds and returns" value={formatCents(v.refundsCents + v.returnsCents)} note={`Net ${formatCents(v.netCents)}`} />
      </div>
      {v.other.count > 0 && <p className="text-xs text-slate-500">{formatCents(v.other.amountCents)} ({v.other.count}) is not yet identified as card or ACH and is included in the total.</p>}

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <h3 className="px-4 pt-4 text-sm font-bold text-slate-900">Clients</h3>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">Client</th>
              {!agentView && <th className="px-4 py-3 font-semibold">Brought by</th>}
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold text-right">Card</th>
              <th className="px-4 py-3 font-semibold text-right">ACH</th>
              <th className="px-4 py-3 font-semibold text-right">Total</th>
              <th className="px-4 py-3 font-semibold text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {v.clients.map((c) => (
              <tr key={c.churchId} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 font-semibold text-slate-900">
                  <a className="hover:underline" href={`/partner/transactions?client=${c.churchId}&period=${p.key}`}>{c.name}</a>
                  {c.status !== "ACTIVE" && <span className="ml-2 text-xs text-slate-400">terminated</span>}
                </td>
                {!agentView && (
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.agentName ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{c.agentName ?? "No agent"}</span>
                  </td>
                )}
                <td className="px-4 py-3 text-slate-600">{dateFmt.format(new Date(c.joinedAt))}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCents(c.card.amountCents)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{formatCents(c.ach.amountCents)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCents(c.totalCents)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{c.paymentCount.toLocaleString("en-US")}</td>
              </tr>
            ))}
            {v.clients.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>No clients yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
