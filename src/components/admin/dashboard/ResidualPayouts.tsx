"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Banknote, Check, FileUp, Info, Landmark, Loader2, Receipt, Scale, Undo2 } from "lucide-react";
import Card from "@/components/merchant/reporting/overview/Card";
import KpiTile from "@/components/merchant/reporting/overview/KpiTile";
import { formatCents } from "@/components/merchant/reporting/overview/format";
import type { ResidualLedger, ResidualMonth, ResidualStatus } from "@/lib/admin/residuals";

const STATUS: Record<ResidualStatus, { label: string; className: string }> = {
  IN_PROGRESS: { label: "This month", className: "bg-slate-100 text-slate-600" },
  WAITING_ON_FINIX: { label: "Waiting on Finix", className: "bg-sky-50 text-sky-700" },
  STATEMENT_MISSING: { label: "No statement", className: "bg-amber-50 text-amber-800" },
  PENDING: { label: "Pending at Finix", className: "bg-sky-50 text-sky-700" },
  NEGATIVE: { label: "WGC owed Finix", className: "bg-rose-50 text-rose-700" },
  PAID_UNCONFIRMED: { label: "Paid · confirm in bank", className: "bg-amber-50 text-amber-800" },
  RECEIVED: { label: "Received", className: "bg-emerald-50 text-emerald-700" },
};

const monthLabel = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const today = () => new Date().toISOString().slice(0, 10);
const btn = "rounded-lg px-2 py-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60";

function ImportPanel({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/residual-settlements/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't import the statements.");
      const skipped = data.errors?.length ? `, ${data.errors.length} row(s) skipped` : "";
      toast.success(`Imported: ${data.created} new, ${data.updated} updated${skipped}.`);
      if (data.errors?.length) data.errors.slice(0, 3).forEach((m: string) => toast.error(m));
      onDone();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't import the statements.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-xs text-slate-600">
        In Finix, open <span className="font-semibold">Residuals</span>, export the <span className="font-semibold">Residual Settlements</span> list, and upload it
        here or paste the table. Re-importing is safe: existing months are updated, never duplicated.
      </p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        <FileUp className="h-4 w-4" aria-hidden />
        Choose CSV file
        <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} className="sr-only" />
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="…or paste the export here (header row included)"
        aria-label="Residual Settlements export"
        className="w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || !text.trim()}
          onClick={submit}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Import statements
        </button>
      </div>
    </div>
  );
}

function DepositCell({ m, canManage }: { m: ResidualMonth; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const s = m.statement;

  async function save(depositReceivedAt: string | null) {
    if (!s) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/residual-settlements/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositReceivedAt }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save.");
      toast.success(depositReceivedAt ? "Marked as received." : "Unmarked.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const pill = (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[m.status].className}`}>
      {m.status === "RECEIVED" && s?.depositReceivedAt ? `Received ${shortDate(s.depositReceivedAt)}` : STATUS[m.status].label}
    </span>
  );

  if (!canManage || !s) return pill;
  if (m.status === "PAID_UNCONFIRMED") {
    return editing ? (
      <span className="inline-flex items-center gap-1">
        <input
          type="date"
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date the payout arrived"
          className="h-7 rounded-lg border border-slate-200 px-1.5 text-xs"
        />
        <button type="button" disabled={busy} onClick={() => save(date)} className={`${btn} bg-slate-900 text-white hover:bg-slate-800`}>
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className={`${btn} text-slate-500 hover:bg-slate-100`}>
          Cancel
        </button>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5">
        {pill}
        <button type="button" onClick={() => setEditing(true)} className={`${btn} inline-flex items-center gap-1 text-indigo-600 hover:bg-indigo-50`}>
          <Check className="h-3.5 w-3.5" aria-hidden />
          Mark received
        </button>
      </span>
    );
  }
  if (m.status === "RECEIVED") {
    return (
      <span className="inline-flex items-center gap-1">
        {pill}
        <button type="button" disabled={busy} onClick={() => save(null)} className={`${btn} text-slate-400 hover:bg-slate-100 hover:text-slate-600`} aria-label="Undo received">
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    );
  }
  return pill;
}

export default function ResidualPayouts({ ledger, canManage }: { ledger: ResidualLedger; canManage: boolean }) {
  const [importing, setImporting] = useState(false);
  const icon = "h-4 w-4";
  const { totals } = ledger;
  const hasStatements = ledger.months.some((m) => m.statement);

  const importButton =
    canManage && !importing ? (
      <button
        type="button"
        onClick={() => setImporting(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        <FileUp className="h-3.5 w-3.5" aria-hidden />
        Import Finix statements
      </button>
    ) : undefined;

  return (
    <div className="min-w-0 space-y-3">
      {!hasStatements && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden />
          <p>
            No Finix residual statements imported yet. Finix only shows them in its dashboard, so import the Residual Settlements export to see what
            Finix charged, what it cost, and what it paid WGC.
          </p>
        </div>
      )}
      {ledger.missingStatementMonths.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <p>
            <span className="font-semibold">No Finix statement for {ledger.missingStatementMonths.map(monthLabel).join(", ")}.</span> WGC took payments that
            month, and Finix normally issues the statement by mid-next-month. Import the latest export, or ask Finix if it&apos;s missing.
          </p>
        </div>
      )}
      {totals.unconfirmedCents > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <p>
            Finix approved <span className="font-semibold">{formatCents(totals.unconfirmedCents)}</span> that isn&apos;t marked as received yet. Check WGC&apos;s bank
            account for the deposits, then mark each month received.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Fees charged"
          value={formatCents(totals.feesCents)}
          icon={<Receipt className={icon} />}
          tip="All merchant fees Finix collected from organizations for WGC, per Finix's statements: transaction fees plus payout and other service fees."
          hint="Per Finix statements"
        />
        <KpiTile
          label="Finix costs"
          value={formatCents(totals.costsCents)}
          icon={<Scale className={icon} />}
          tip="Card network costs (interchange, dues and assessments), Finix's processing fees, payout fees and verifications, per Finix's statements."
          hint="Network + Finix fees"
        />
        <KpiTile
          label="WGC earned"
          value={formatCents(totals.residualCents)}
          icon={<Banknote className={icon} />}
          tip="Fees charged minus Finix costs: the residuals Finix approved. Negative months reduce this."
          hint="Approved residuals"
        />
        <KpiTile
          label="Received in bank"
          value={formatCents(totals.receivedCents)}
          icon={<Landmark className={icon} />}
          tip="Residual payouts an admin has confirmed arrived in WGC's bank account."
          hint={totals.unconfirmedCents > 0 ? `${formatCents(totals.unconfirmedCents)} to confirm` : "All confirmed"}
        />
      </div>

      <Card title="Residuals by month" subtitle="Finix's monthly statements, with WGC's own records beside them" action={importButton}>
        {importing && <ImportPanel onDone={() => setImporting(false)} />}
        {ledger.months.length === 0 ? (
          <p className="text-sm text-slate-500">No payments or statements yet.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                  <th className="px-5 py-2 sm:px-6">Month</th>
                  <th className="px-2 py-2 text-right">WGC records</th>
                  <th className="px-2 py-2 text-right">Finix fees</th>
                  <th className="px-2 py-2 text-right">Difference</th>
                  <th className="px-2 py-2 text-right">Finix costs</th>
                  <th className="px-2 py-2 text-right">Residual</th>
                  <th className="px-5 py-2 text-right sm:px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...ledger.months].reverse().map((m) => {
                  const s = m.statement;
                  return (
                    <tr key={m.month}>
                      <td className="px-5 py-2.5 font-medium text-slate-800 sm:px-6">{m.label}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                        {formatCents(m.wgcChargedCents)}
                        <span className="block text-[11px] text-slate-400">{m.wgcPaymentCount} payments</span>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{s ? formatCents(s.merchantFeesCents) : "—"}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">
                        {m.feeDifferenceCents === null ? "—" : `${m.feeDifferenceCents > 0 ? "+" : ""}${formatCents(m.feeDifferenceCents)}`}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{s ? `−${formatCents(s.costsCents)}` : "—"}</td>
                      <td className={`px-2 py-2.5 text-right font-semibold tabular-nums ${s && s.totalResidualCents < 0 ? "text-rose-600" : "text-slate-900"}`}>
                        {s ? formatCents(s.totalResidualCents) : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right sm:px-6">
                        <DepositCell m={m} canManage={canManage} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">WGC records</span> are the transaction fees WGC charged on that month&apos;s payments.{" "}
          <span className="font-semibold text-slate-600">Finix fees</span> also include $0.50 payout fees and other service fees, so the difference is usually
          small and positive. A large or negative difference is worth checking with Finix.
        </p>
      </Card>
    </div>
  );
}
