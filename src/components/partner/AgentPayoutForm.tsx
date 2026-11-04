"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The partner's own record of paying an agent. It records a payment; it does not move money. */
export default function AgentPayoutForm({ agents }: { agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setError("Enter the amount paid.");
    setBusy(true);
    try {
      const res = await fetch("/api/partner/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recordAgentPayout", agentId, month, amountCents: cents, paidAt, method }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not record the payment.");
      setAmount("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const field = "rounded-lg border border-slate-200 px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-bold text-slate-900">Record a payment to an agent</h3>
      <div className="flex flex-wrap gap-3">
        <select className={field} value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Agent">
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className={field} type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month it is for" />
        <input className={`${field} w-32`} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
        <input className={field} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} aria-label="Date paid" />
        <input className={`${field} w-40`} placeholder="How (ACH, check)" value={method} onChange={(e) => setMethod(e.target.value)} />
        <button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "Saving…" : "Record"}</button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
