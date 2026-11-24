"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SCHEDULE_TEMPLATE_CSV } from "@/lib/migrations/recurringImportText";

/** The merchant picks their recurring-gift schedule file and sends it to WGC. No card or bank numbers: the server refuses a file that has them. */
export default function RecurringScheduleUpload() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ rows: number; name: string } | null>(null);

  async function pick(file: File | undefined) {
    setSent(null);
    setError(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("The file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/migrations/recurring-schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleCsv: csv, fileName }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The file could not be sent.");
      setSent({ rows: data.rowCount, name: fileName });
      setCsv("");
      setFileName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file could not be sent.");
    }
    setBusy(false);
  }

  function template() {
    const url = URL.createObjectURL(new Blob([SCHEDULE_TEMPLATE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "recurring-schedule-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Send your recurring schedule</h3>
      <p className="mt-1 text-sm text-slate-500">
        One row per recurring gift: customer ID, donor name and email, amount, how often, the <strong>next charge date</strong> and the fund. <strong>Do not include card or bank numbers.</strong> WGC refuses a file that has them.
      </p>
      <button type="button" onClick={template} className="mt-2 text-sm font-semibold text-indigo-600 hover:underline">Download the template</button>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input type="file" accept=".csv,text/csv" aria-label="Recurring schedule CSV" onChange={(e) => pick(e.target.files?.[0])} className="text-sm" />
        <button type="button" disabled={busy || !csv} onClick={send} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Sending…" : "Send to WGC"}
        </button>
      </div>
      {fileName && !sent && <p className="mt-2 text-xs text-slate-500">Ready to send: {fileName}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {sent && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Sent {sent.name}: {sent.rows} recurring gifts. WGC will pick it up and be in touch about the next step.</p>}
    </div>
  );
}
