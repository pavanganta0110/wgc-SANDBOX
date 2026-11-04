import { formatCents } from "@/lib/format";
import type { CommissionView } from "@/lib/partners/loadCommission";

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
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

const STATUS: Record<string, { text: string; cls: string }> = {
  FINAL: { text: "Final", cls: "bg-emerald-100 text-emerald-800" },
  ESTIMATE: { text: "Estimate", cls: "bg-amber-100 text-amber-800" },
  AWAITING_STATEMENT: { text: "Awaiting statement", cls: "bg-slate-100 text-slate-600" },
};

/**
 * One commission view for any audience. The loader has already hidden what the viewer must not see, so this
 * only draws what is present (WGC's share and total profit exist only in the admin view; an agent gets only
 * their own amount).
 */
export default function CommissionStatement({ data }: { data: CommissionView }) {
  const v = data.viewer;
  const mineWord = v === "agent" ? "Your commission" : v === "partner" ? "Your share" : "Partner share";
  const paidLabel = v === "admin" ? "Paid to partner" : "Paid to you";
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={`${mineWord}, final`} value={formatCents(data.totals.finalCents)} note="Finalized months" />
        <Tile label="Estimate, not final yet" value={formatCents(data.totals.estimateCents)} note="Can still change before it is finalized" />
        <Tile label={paidLabel} value={formatCents(data.totals.paidCents)} />
        <Tile label="Owed" value={formatCents(data.totals.owedCents)} note="Final minus paid" />
      </div>

      {data.monthsAwaitingStatement > 0 && (
        <p className="text-xs text-slate-500">
          {data.monthsAwaitingStatement} earlier {data.monthsAwaitingStatement === 1 ? "month is" : "months are"} waiting for the payment processor&apos;s monthly statement. Nothing is
          shown as earned for a month until its statement is in.
        </p>
      )}

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <h3 className="px-4 pt-4 text-sm font-bold text-slate-900">By month</h3>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">Month</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {v === "admin" && <th className="px-4 py-3 font-semibold text-right">Profit</th>}
              {v === "admin" && <th className="px-4 py-3 font-semibold text-right">WGC keeps</th>}
              {v !== "agent" && <th className="px-4 py-3 font-semibold text-right">{v === "admin" ? "Partner share" : "Your share"}</th>}
              {v !== "agent" && <th className="px-4 py-3 font-semibold text-right">To agents</th>}
              {v !== "agent" && <th className="px-4 py-3 font-semibold text-right">Partner keeps</th>}
              {v === "agent" && <th className="px-4 py-3 font-semibold text-right">Your commission</th>}
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => {
              const st = STATUS[m.status]!;
              const money = (c: number | null) => (c === null ? "—" : formatCents(c));
              return (
                <tr key={m.month} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-slate-900">{m.label}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.text}</span></td>
                  {v === "admin" && <td className="px-4 py-3 text-right text-slate-900">{money(m.profitCents)}</td>}
                  {v === "admin" && <td className="px-4 py-3 text-right text-slate-900">{money(m.wgcCents)}</td>}
                  {v !== "agent" && <td className="px-4 py-3 text-right text-slate-900">{money(m.partnerCents)}{m.partnerRateBps !== null && <span className="ml-1 text-xs text-slate-400">({pct(m.partnerRateBps)})</span>}</td>}
                  {v !== "agent" && <td className="px-4 py-3 text-right text-slate-900">{money(m.agentsCents)}</td>}
                  {v !== "agent" && <td className="px-4 py-3 text-right text-slate-900">{money(m.partnerKeepsCents)}</td>}
                  {v === "agent" && <td className="px-4 py-3 text-right font-semibold text-slate-900">{money(m.yourCents)}</td>}
                </tr>
              );
            })}
            {data.months.length === 0 && (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={8}>No activity yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {v !== "agent" && data.agents.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <h3 className="px-4 pt-4 text-sm font-bold text-slate-900">Agents</h3>
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">Agent</th>
                <th className="px-4 py-3 font-semibold text-right">Rate</th>
                <th className="px-4 py-3 font-semibold text-right">Organizations</th>
                <th className="px-4 py-3 font-semibold text-right">Earned (final)</th>
                <th className="px-4 py-3 font-semibold text-right">Paid</th>
                <th className="px-4 py-3 font-semibold text-right">Owed</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((a) => {
                const o = data.owedToAgents.find((x) => x.agentId === a.id);
                return (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-slate-900">{a.name}{a.status !== "ACTIVE" && <span className="ml-2 text-xs text-slate-400">inactive</span>}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{pct(a.rateBps)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{a.organizations}</td>
                    <td className="px-4 py-3 text-right text-slate-900">{formatCents(o?.finalCents ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-slate-900">{formatCents(o?.paidCents ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCents(o?.owedCents ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {data.organizations.length > 0 && data.organizationsMonth && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <h3 className="px-4 pt-4 text-sm font-bold text-slate-900">
            By organization, {new Date(data.organizationsMonth).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
          </h3>
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">Organization</th>
                {v !== "agent" && <th className="px-4 py-3 font-semibold">Agent</th>}
                {v === "admin" && <th className="px-4 py-3 font-semibold text-right">Profit</th>}
                <th className="px-4 py-3 font-semibold text-right">{v === "agent" ? "Your commission" : "Partner share"}</th>
              </tr>
            </thead>
            <tbody>
              {data.organizations.map((o) => (
                <tr key={o.churchId} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-slate-900">{o.name}</td>
                  {v !== "agent" && <td className="px-4 py-3 text-slate-600">{o.agentName ?? "—"}</td>}
                  {v === "admin" && <td className="px-4 py-3 text-right text-slate-900">{formatCents(o.profitCents ?? 0)}</td>}
                  <td className="px-4 py-3 text-right text-slate-900">{formatCents(o.yourCents ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <h3 className="px-4 pt-4 text-sm font-bold text-slate-900">Payments</h3>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">Paid on</th>
              <th className="px-4 py-3 font-semibold">For</th>
              {v !== "agent" && <th className="px-4 py-3 font-semibold">To</th>}
              <th className="px-4 py-3 font-semibold">How</th>
              <th className="px-4 py-3 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.payouts.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-slate-700">{dateFmt.format(new Date(p.paidAt))}</td>
                <td className="px-4 py-3 text-slate-700">{new Date(p.month).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</td>
                {v !== "agent" && <td className="px-4 py-3 text-slate-700">{p.agentName ?? (v === "admin" ? "Partner" : "You")}</td>}
                <td className="px-4 py-3 text-slate-600">{[p.method, p.note].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCents(p.amountCents)}</td>
              </tr>
            ))}
            {data.payouts.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={5}>No payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
