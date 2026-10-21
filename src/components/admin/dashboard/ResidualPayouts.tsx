"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, Hourglass, Loader2, Plus, Trash2 } from "lucide-react";
import Card from "@/components/merchant/reporting/overview/Card";
import KpiTile from "@/components/merchant/reporting/overview/KpiTile";
import { formatCents } from "@/components/merchant/reporting/overview/format";
import type { ResidualLedger, ResidualStatus } from "@/lib/admin/residuals";

const STATUS: Record<ResidualStatus, { label: string; className: string }> = {
  IN_PROGRESS: { label: "This month", className: "bg-slate-100 text-slate-600" },
  NOT_DUE: { label: "Not due yet", className: "bg-sky-50 text-sky-700" },
  OVERDUE: { label: "Not paid", className: "bg-rose-50 text-rose-700" },
  PARTIAL: { label: "Partly paid", className: "bg-amber-50 text-amber-800" },
  PAID: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  NOTHING_OWED: { label: "Nothing owed", className: "bg-slate-100 text-slate-500" },
};

const monthLabel = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const input =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

function RecordPayoutForm({ months, onDone }: { months: ResidualLedger["months"]; onDone: () => void }) {
  const router = useRouter();
  const choices = months.filter((m) => m.status !== "IN_PROGRESS").reverse();
  const [month, setMonth] = useState(choices.find((m) => m.status === "OVERDUE" || m.status === "PARTIAL")?.month ?? choices[0]?.month ?? "");
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [settlementId, setSettlementId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
    if (!month || !Number.isFinite(cents) || cents <= 0) {
      toast.error("Choose a month and enter the amount received.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/residual-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: month.slice(0, 7), amountCents: cents, receivedAt, finixBillingSettlementId: settlementId, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save the payout.");
      toast.success("Payout recorded.");
      onDone();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the payout.");
    } finally {
      setSaving(false);
    }
  }

  if (choices.length === 0) return <p className="text-sm text-slate-500">There&apos;s no finished month to record a payout against yet.</p>;

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-xs font-semibold text-slate-600">
        Month it covers
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${input} mt-1`}>
          {choices.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label} · {formatCents(Math.max(m.expectedCents - m.paidCents, 0))} expected
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-600">
        Amount received
        <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} mt-1`} required />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        Date it arrived
        <input type="date" value={receivedAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setReceivedAt(e.target.value)} className={`${input} mt-1`} required />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        Finix billing settlement ID <span className="font-normal text-slate-400">(optional)</span>
        <input value={settlementId} onChange={(e) => setSettlementId(e.target.value)} className={`${input} mt-1`} maxLength={100} />
      </label>
      <label className="text-xs font-semibold text-slate-600">
        Note <span className="font-normal text-slate-400">(optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} mt-1`} maxLength={500} />
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-5">
        <button type="button" onClick={onDone} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save payout
        </button>
      </div>
    </form>
  );
}

function PayoutRow({ p, canManage }: { p: ResidualLedger["payouts"][number]; canManage: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/residual-payouts/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't remove it.");
      toast.success("Payout removed.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove it.");
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="font-semibold tabular-nums text-slate-900">{formatCents(p.amountCents)}</span>
      <span className="text-slate-600">for {monthLabel(p.month)}</span>
      <span className="text-xs text-slate-500">
        arrived {shortDate(p.receivedAt)}
        {p.finixBillingSettlementId && ` · ${p.finixBillingSettlementId}`} · by {p.recordedByEmail}
        {p.note && ` · ${p.note}`}
      </span>
      {canManage && (
        <span className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-xs text-slate-500">Remove this payout?</span>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Keep
              </button>
              <button type="button" disabled={busy} onClick={remove} className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                Remove
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600" aria-label={`Remove payout of ${formatCents(p.amountCents)}`}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </span>
      )}
    </li>
  );
}

export default function ResidualPayouts({ ledger, canManage }: { ledger: ResidualLedger; canManage: boolean }) {
  const [recording, setRecording] = useState(false);
  const icon = "h-4 w-4";
  const overdueMonths = ledger.months.filter((m) => m.status === "OVERDUE" || m.status === "PARTIAL");
  const anyPreliminary = ledger.months.some((m) => !m.isFinal && m.status !== "IN_PROGRESS" && m.expectedCents > 0);
  const anyMissing = ledger.months.some((m) => m.missingFeeDataCount > 0);

  if (!ledger.firstMonth) {
    return (
      <Card title="Finix residual payouts" subtitle="Your fee revenue that Finix pays out monthly">
        <p className="text-sm text-slate-500">No payments yet, so there&apos;s nothing for Finix to pay out.</p>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {ledger.outstandingCents > 0 && ledger.oldestOverdueMonth && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
          <div>
            <p className="font-semibold">
              {ledger.paidCents === 0
                ? `Finix hasn't paid any residuals since WGC started processing in ${monthLabel(ledger.firstMonth)}.`
                : `Finix residuals are unpaid since ${monthLabel(ledger.oldestOverdueMonth)}.`}
            </p>
            <p className="mt-1 text-rose-800">
              About <span className="font-semibold">{formatCents(ledger.outstandingCents)}</span> is owed across {overdueMonths.length} month
              {overdueMonths.length === 1 ? "" : "s"}. The oldest is {ledger.daysOverdue} day{ledger.daysOverdue === 1 ? "" : "s"} past when Finix
              normally pays. Check the billing settlements in the Finix dashboard and ask your Finix Customer Delivery Manager which bank account
              residuals go to and whether any are being held.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Owed so far"
          value={formatCents(ledger.dueCents)}
          icon={<CalendarClock className={icon} />}
          tip="What WGC charged in fees minus Finix's costs, for every month Finix should already have paid (about 30 days after the month's billing settlement)."
          hint={`Since ${monthLabel(ledger.firstMonth)}`}
        />
        <KpiTile
          label="Received"
          value={formatCents(ledger.paidCents)}
          icon={<Banknote className={icon} />}
          tip="Residual payouts recorded below, as they arrive in WGC's bank account."
          hint={`${ledger.payouts.length} payout${ledger.payouts.length === 1 ? "" : "s"} recorded`}
        />
        <KpiTile
          label="Outstanding"
          value={formatCents(Math.max(ledger.outstandingCents, 0))}
          icon={ledger.outstandingCents > 0 ? <AlertTriangle className={icon} /> : <CheckCircle2 className={icon} />}
          tip="Owed so far minus received. If this keeps growing, Finix isn't paying out residuals."
          hint={ledger.outstandingCents > 0 ? `${overdueMonths.length} month${overdueMonths.length === 1 ? "" : "s"} unpaid` : "All caught up"}
        />
        <KpiTile
          label="Not due yet"
          value={formatCents(ledger.upcomingCents)}
          icon={<Hourglass className={icon} />}
          tip="Expected residuals for recent months, including this one, that Finix hasn't had time to pay yet."
          hint="Recent months"
        />
      </div>

      <Card
        title="Residuals by month"
        subtitle="Expected = fees WGC charged − Finix's costs. Finix pays each month about 30 days after its billing settlement."
        action={
          canManage && !recording ? (
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Record a payout
            </button>
          ) : undefined
        }
      >
        {recording && (
          <div className="mb-4">
            <RecordPayoutForm months={ledger.months} onDone={() => setRecording(false)} />
          </div>
        )}
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                <th className="px-5 py-2 sm:px-6">Month</th>
                <th className="px-2 py-2 text-right">Payments</th>
                <th className="px-2 py-2 text-right">WGC charged</th>
                <th className="px-2 py-2 text-right">Finix cost</th>
                <th className="px-2 py-2 text-right">Expected</th>
                <th className="px-2 py-2 text-right">Received</th>
                <th className="px-5 py-2 text-right sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...ledger.months].reverse().map((m) => (
                <tr key={m.month}>
                  <td className="px-5 py-2.5 font-medium text-slate-800 sm:px-6">
                    {m.label}
                    {!m.isFinal && m.status !== "IN_PROGRESS" && <span className="ml-1.5 text-[11px] font-normal text-slate-400">preliminary</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{m.paymentCount.toLocaleString("en-US")}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{formatCents(m.chargedCents)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{formatCents(m.finixCostCents)}</td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatCents(m.expectedCents)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-900">{m.paidCents > 0 ? formatCents(m.paidCents) : "—"}</td>
                  <td className="px-5 py-2.5 text-right sm:px-6">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[m.status].className}`}
                      title={m.status === "NOT_DUE" || m.status === "OVERDUE" ? `Normally paid by ${shortDate(m.expectedBy)}` : undefined}
                    >
                      {STATUS[m.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(anyPreliminary || anyMissing) && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {anyPreliminary && "\"Preliminary\" months can still change: Finix finalizes its cost data after the 15th of the following month. "}
            {anyMissing && "Some payments don't have Finix fee details synced yet, so their cost counts as $0 and the expected amount is a bit high."}
          </p>
        )}
      </Card>

      {ledger.payouts.length > 0 && (
        <Card title="Recorded payouts" subtitle="Entered by WGC admins from Finix billing settlements">
          <ul className="divide-y divide-slate-100">
            {ledger.payouts.map((p) => (
              <PayoutRow key={p.id} p={p} canManage={canManage} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
