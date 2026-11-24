"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ATTESTATION_TEXT, MAPPING_TEMPLATE_CSV, SCHEDULE_TEMPLATE_CSV } from "@/lib/migrations/recurringImportText";

interface PreviewRow {
  rowNumber: number;
  status: "VALID" | "WARNING" | "INVALID" | "DUPLICATE";
  messages: string[];
  externalCustomerId: string;
  donorName: string | null;
  amountCents: number | null;
  frequency: string | null;
  nextChargeDate: string | null;
  fundName: string | null;
  finixInstrumentId: string | null;
}
interface Preview {
  rows: PreviewRow[];
  counts: { total: number; VALID: number; WARNING: number; INVALID: number; DUPLICATE: number };
  unmatchedFunds: string[];
  fileErrors: string[];
  truncated: boolean;
}
interface Fund {
  id: string;
  name: string;
}

const BADGE: Record<string, string> = {
  VALID: "bg-green-50 text-green-700",
  WARNING: "bg-amber-50 text-amber-700",
  INVALID: "bg-red-50 text-red-700",
  DUPLICATE: "bg-slate-100 text-slate-600",
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Staff-only: upload the schedule file and Finix's mapping file, check them with a dry run, then create the import. */
export default function RecurringImportWizard({ churchId, submissions = [] }: { churchId: string; submissions?: { id: string; fileName: string | null; rowCount: number }[] }) {
  const router = useRouter();
  const [scheduleCsv, setScheduleCsv] = useState("");
  const [mappingCsv, setMappingCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [fundMap, setFundMap] = useState<Record<string, string>>({});
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [submissionId, setSubmissionId] = useState<string>("");

  async function readFile(file: File | undefined, set: (t: string) => void, remember = false) {
    if (!file) return;
    set(await file.text());
    if (remember) setFileName(file.name);
    setPreview(null);
  }

  async function useSubmission(id: string) {
    setSubmissionId(id);
    setPreview(null);
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/migration/recurring/submission/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the file.");
      setScheduleCsv(data.csv);
      setFileName(data.fileName || "merchant-schedule.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the file.");
      setSubmissionId("");
    }
  }

  async function runPreview(map: Record<string, string> = fundMap) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/migration/recurring/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleCsv, mappingCsv, fundMap: map }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not check the files.");
      setPreview(data.preview);
      setFunds(data.funds);
      setFundMap(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the files.");
    }
    setBusy(false);
  }

  async function createImport() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/migration/recurring/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleCsv, mappingCsv, fundMap, fileName, attestation: attest, submissionId: submissionId || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the import.");
      router.push(`/admin/merchants/${churchId}/migration/${data.jobId}?autostart=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the import.");
      setBusy(false);
    }
  }

  const importable = preview ? preview.counts.VALID + preview.counts.WARNING : 0;
  const shown = preview ? preview.rows.filter((r) => filter === "ALL" || r.status === filter) : [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-900">1. Upload the two files</h3>
        <p className="mt-1 text-sm text-slate-500">
          The <strong>schedule file</strong> has one row per recurring gift and no card numbers. The <strong>mapping file</strong> is the CSV Finix sends back after it imports the saved cards and bank accounts.
        </p>
        {submissions.length > 0 && (
          <label className="mt-4 block text-sm">
            <span className="font-semibold text-slate-700">Use a file the merchant sent</span>
            <select value={submissionId} onChange={(e) => useSubmission(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:w-96">
              <option value="">Choose a file&hellip;</option>
              {submissions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fileName || "schedule.csv"} &middot; {s.rowCount} gifts
                </option>
              ))}
            </select>
            {submissionId && scheduleCsv && <span className="mt-1 block text-xs text-green-700">Loaded {fileName}. Now add Finix&rsquo;s mapping file.</span>}
          </label>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Schedule file (CSV)</span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0], setScheduleCsv, true)} className="mt-1 block w-full text-sm" />
            <button type="button" onClick={() => download("recurring-schedule-template.csv", SCHEDULE_TEMPLATE_CSV)} className="mt-1 text-xs font-semibold text-blue-600 hover:underline">Download the template</button>
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Finix mapping file (CSV)</span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0], setMappingCsv)} className="mt-1 block w-full text-sm" />
            <button type="button" onClick={() => download("finix-mapping-template.csv", MAPPING_TEMPLATE_CSV)} className="mt-1 text-xs font-semibold text-blue-600 hover:underline">Download the template</button>
          </label>
        </div>
        <button type="button" disabled={busy || !scheduleCsv || !mappingCsv} onClick={() => runPreview()} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Checking…" : "Check the files (dry run)"}
        </button>
        <p className="mt-2 text-xs text-slate-500">The dry run creates nothing and does not contact Finix.</p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {preview && preview.fileErrors.length > 0 && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {preview.fileErrors.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}

      {preview && preview.fileErrors.length === 0 && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-slate-900">2. What would happen</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Rows", preview.counts.total, "text-slate-900"],
                ["Ready", preview.counts.VALID, "text-green-700"],
                ["With warnings", preview.counts.WARNING, "text-amber-700"],
                ["Invalid", preview.counts.INVALID, "text-red-700"],
                ["Already imported / repeated", preview.counts.DUPLICATE, "text-slate-600"],
              ].map(([label, n, cls]) => (
                <div key={label as string} className="rounded-lg bg-slate-50 p-3">
                  <div className={`text-2xl font-bold ${cls}`}>{n as number}</div>
                  <div className="text-xs text-slate-500">{label as string}</div>
                </div>
              ))}
            </div>
            {preview.truncated && <p className="mt-3 text-sm text-amber-700">The file has more than 5,000 rows; only the first 5,000 were checked. Split it.</p>}

            {preview.unmatchedFunds.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800">Match these funds to WGC funds</p>
                <div className="mt-2 space-y-2">
                  {preview.unmatchedFunds.map((name) => (
                    <div key={name} className="flex items-center gap-3 text-sm">
                      <span className="w-48 truncate font-medium text-slate-800">{name}</span>
                      <select
                        className="rounded-md border border-slate-300 px-2 py-1"
                        value={fundMap[name.toLowerCase()] ?? ""}
                        onChange={(e) => e.target.value && runPreview({ ...fundMap, [name.toLowerCase()]: e.target.value })}
                      >
                        <option value="">Choose a fund…</option>
                        {funds.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {funds.length === 0 && <p className="mt-2 text-xs text-amber-800">This organization has no funds yet. Create them under Funds first.</p>}
              </div>
            )}

            <div className="mt-4 flex gap-2 text-xs">
              {["ALL", "VALID", "WARNING", "INVALID", "DUPLICATE"].map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 font-semibold ${filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    {["Row", "Status", "Customer", "Donor", "Amount", "Frequency", "First charge", "Fund", "Notes"].map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.rowNumber} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">{r.rowNumber}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 font-semibold ${BADGE[r.status]}`}>{r.status.toLowerCase()}</span></td>
                      <td className="px-3 py-2 tabular-nums">{r.externalCustomerId}</td>
                      <td className="px-3 py-2">{r.donorName || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.amountCents == null ? "—" : `$${(r.amountCents / 100).toFixed(2)}`}</td>
                      <td className="px-3 py-2">{r.frequency ? r.frequency.toLowerCase() : "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.nextChargeDate || "—"}</td>
                      <td className="px-3 py-2">{r.fundName || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.messages.join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-slate-900">3. Create the import</h3>
            <p className="mt-1 text-sm text-slate-500">
              This creates a job with the {importable} importable rows. Nothing is charged: each recurring gift is created in Finix with its first charge on the date in the file.
            </p>
            <label className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-1" />
              <span>{ATTESTATION_TEXT}</span>
            </label>
            <button type="button" disabled={busy || !attest || importable === 0} onClick={createImport} className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-50">
              {busy ? "Creating…" : `Create import for ${importable} gifts`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
