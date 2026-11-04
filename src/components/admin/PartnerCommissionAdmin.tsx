"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CommissionStatement from "@/components/partner/CommissionStatement";
import { formatCents } from "@/lib/format";
import type { CommissionView } from "@/lib/partners/loadCommission";

const field = "rounded-lg border border-slate-200 px-3 py-2 text-sm";
const btn = "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
const today = () => new Date().toISOString().slice(0, 10);

export default function PartnerCommissionAdmin({ partnerId }: { partnerId: string }) {
  const [data, setData] = useState<CommissionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/partners/${partnerId}/commission`);
    const body = await res.json().catch(() => null);
    if (!res.ok) return setError(body?.error || "Failed to load.");
    setData(body as CommissionView);
  }, [partnerId]);
  useEffect(() => { void load(); }, [load]);

  async function act(payload: Record<string, unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/commission`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "That did not work.");
      if (done) setNotice(done);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function invite(agentId: string) {
    const email = window.prompt("Agent's email address for their login:");
    if (!email) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, agentId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not send the invitation.");
      setNotice(body.message || "Invitation sent.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const [agentName, setAgentName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [rateTarget, setRateTarget] = useState("");
  const [rate, setRate] = useState("");
  const [rateFrom, setRateFrom] = useState(today().slice(0, 7));
  const [adj, setAdj] = useState({ churchId: "", month: today().slice(0, 7), amount: "", reason: "" });
  const [pay, setPay] = useState({ month: today().slice(0, 7), amount: "", paidAt: today(), method: "" });
  const [finalizeKey, setFinalizeKey] = useState("");

  if (!data) return <p className="text-sm text-slate-500">{error ?? "Loading…"}</p>;
  const estimateMonths = data.months.filter((m) => m.status === "ESTIMATE").reverse();
  const toMonthInput = (iso: string) => iso.slice(0, 7);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/partners/${partnerId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Partner performance
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{data.partner.name}: commission</h1>
        <p className="text-sm text-slate-500 mt-1">
          Partner share of profit: <strong>{pct(data.partnerRateBps)}</strong>. Of that, each agent gets their own rate (default 80%) for their organizations; the partner keeps the rest.
          The partner and their agents never see WGC&apos;s share.
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <CommissionStatement data={data} />

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Finalize a month</h3>
        <p className="text-xs text-slate-500">Freezes the month&apos;s figures and the rates used, so later changes can&apos;t alter it. Do it once the processor statement is approved and you have checked the month. Oldest month first.</p>
        <div className="flex gap-3">
          <select className={field} value={finalizeKey} onChange={(e) => setFinalizeKey(e.target.value)}>
            <option value="">Choose a month</option>
            {estimateMonths.map((m) => <option key={m.month} value={toMonthInput(m.month)}>{m.label} ({formatCents(m.partnerCents ?? 0)} partner share)</option>)}
          </select>
          <button className={btn} disabled={busy || !finalizeKey} onClick={() => { if (window.confirm("Finalize this month? It can't be changed afterward.")) void act({ action: "finalizeMonth", month: finalizeKey }, "Month finalized."); }}>Finalize</button>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Rates</h3>
        <p className="text-xs text-slate-500">A new rate starts in the month you choose and never changes a finalized month.</p>
        <div className="flex flex-wrap gap-3">
          <select className={field} value={rateTarget} onChange={(e) => setRateTarget(e.target.value)}>
            <option value="">Partner share of WGC profit ({pct(data.partnerRateBps)})</option>
            {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}: share of the partner&apos;s share ({pct(a.rateBps)})</option>)}
          </select>
          <input className={`${field} w-24`} inputMode="decimal" placeholder="Rate %" value={rate} onChange={(e) => setRate(e.target.value)} />
          <input className={field} type="month" value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} />
          <button className={btn} disabled={busy || !rate} onClick={async () => { if (await act({ action: "setRate", agentId: rateTarget || null, rateBps: Math.round(parseFloat(rate) * 100), effectiveFrom: rateFrom }, "Rate saved.")) setRate(""); }}>Save rate</button>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Agents</h3>
        <div className="flex flex-wrap gap-3">
          <input className={field} placeholder="Agent name" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          <input className={field} placeholder="Email (optional)" value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} />
          <button className={btn} disabled={busy || !agentName.trim()} onClick={async () => { if (await act({ action: "addAgent", name: agentName, email: agentEmail }, "Agent added.")) { setAgentName(""); setAgentEmail(""); } }}>Add agent</button>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {data.agents.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-semibold text-slate-900">{a.name}</span>
              <span className="text-slate-500">{pct(a.rateBps)} · {a.organizations} organizations · {a.hasLogin ? "has a login" : "no login yet"}</span>
              <button className="text-indigo-600 hover:underline" disabled={busy} onClick={() => invite(a.id)}>{a.hasLogin ? "Re-send login invite" : "Invite to log in"}</button>
              <button className="text-slate-500 hover:underline" disabled={busy} onClick={() => act({ action: "updateAgent", agentId: a.id, status: a.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>{a.status === "ACTIVE" ? "Mark inactive" : "Reactivate"}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Which agent brought each organization</h3>
        <ul className="divide-y divide-slate-100 text-sm">
          {data.allOrganizations.map((o) => (
            <li key={o.churchId} className="flex items-center justify-between gap-3 py-2">
              <span className="text-slate-900">{o.name}</span>
              <select className={field} value={o.agentId ?? ""} disabled={busy} onChange={(e) => act({ action: "assign", churchId: o.churchId, agentId: e.target.value || null })}>
                <option value="">No agent (partner keeps all)</option>
                {data.agents.filter((a) => a.status === "ACTIVE" || a.id === o.agentId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </li>
          ))}
          {data.allOrganizations.length === 0 && <li className="py-2 text-slate-500">No organizations are linked to this partner yet.</li>}
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Profit adjustments (chargebacks, refunds)</h3>
        <p className="text-xs text-slate-500">Profit is each organization&apos;s share of the processor&apos;s monthly statement. Enter a negative amount to take a chargeback or refund loss out of an organization&apos;s profit for a month.</p>
        <div className="flex flex-wrap gap-3">
          <select className={field} value={adj.churchId} onChange={(e) => setAdj({ ...adj, churchId: e.target.value })}>
            <option value="">Organization</option>
            {data.allOrganizations.map((o) => <option key={o.churchId} value={o.churchId}>{o.name}</option>)}
          </select>
          <input className={field} type="month" value={adj.month} onChange={(e) => setAdj({ ...adj, month: e.target.value })} />
          <input className={`${field} w-28`} inputMode="decimal" placeholder="-25.00" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
          <input className={`${field} w-64`} placeholder="Reason" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
          <button className={btn} disabled={busy || !adj.churchId || !adj.amount} onClick={async () => { if (await act({ action: "addAdjustment", churchId: adj.churchId, month: adj.month, amountCents: Math.round(parseFloat(adj.amount) * 100), reason: adj.reason }, "Adjustment saved.")) setAdj({ ...adj, amount: "", reason: "" }); }}>Add</button>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {data.adjustments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="text-slate-900">{a.churchName}</span>
              <span className="text-slate-500">{new Date(a.month).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</span>
              <span className="font-semibold">{formatCents(a.amountCents)}</span>
              <span className="text-slate-500">{a.reason}</span>
              <button className="text-rose-600 hover:underline" disabled={busy} onClick={() => act({ action: "deleteAdjustment", id: a.id })}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Record a payment to the partner</h3>
        <p className="text-xs text-slate-500">A record of what you paid them (monthly, outside the system). It doesn&apos;t move money.</p>
        <div className="flex flex-wrap gap-3">
          <input className={field} type="month" value={pay.month} onChange={(e) => setPay({ ...pay, month: e.target.value })} />
          <input className={`${field} w-32`} inputMode="decimal" placeholder="Amount" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          <input className={field} type="date" value={pay.paidAt} onChange={(e) => setPay({ ...pay, paidAt: e.target.value })} />
          <input className={`${field} w-40`} placeholder="How (ACH, check)" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} />
          <button className={btn} disabled={busy || !pay.amount} onClick={async () => { if (await act({ action: "recordPayout", month: pay.month, amountCents: Math.round(parseFloat(pay.amount) * 100), paidAt: pay.paidAt, method: pay.method }, "Payment recorded.")) setPay({ ...pay, amount: "" }); }}>Record</button>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {data.payouts.filter((p) => p.agentId === null).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="text-slate-700">{new Date(p.paidAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</span>
              <span className="font-semibold">{formatCents(p.amountCents)}</span>
              <button className="text-rose-600 hover:underline" disabled={busy} onClick={() => { if (window.confirm("Remove this payment record?")) void act({ action: "deletePayout", id: p.id }); }}>Remove</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
