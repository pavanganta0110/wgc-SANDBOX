"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  MIGRATION_ENTITY_TYPES,
  MIGRATION_ENTITY_LABELS,
  MIGRATION_SOURCE_LABELS,
  type MigrationEntityType,
  type MigrationSourceSystem,
} from "@/lib/migrations/types";
import { fieldOptionsFor } from "@/lib/migrations/fieldMetadata";

interface JobView {
  id: string;
  sourceSystem: string;
  status: string;
  entityTypes: MigrationEntityType[];
  fileName: string | null;
  totalRecords: number;
  processedRecords: number;
  succeededRecords: number;
  failedRecords: number;
  skippedRecords: number;
  createdAt: string | Date;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
}

interface PreviewRow {
  rowNumber: number;
  fields: Record<string, string | null>;
  label: string;
  status: "valid" | "warning" | "invalid" | "duplicate";
  errors: string[];
  warnings: string[];
  possibleDuplicate: boolean;
  duplicateReason: string | null;
}

interface PreviewResult {
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  mapping: Record<string, string | null>;
  missingRequiredFields: string[];
  rows: PreviewRow[];
  summary: { totalRows: number; validRows: number; warningRows: number; invalidRows: number; possibleDuplicates: number };
  cappedAt: number | null;
}

type Step = "pick-entity" | "upload" | "map" | "review";

const DONE_STATUSES = new Set(["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"]);

export default function MigrationWizardClient({ initialJob }: { initialJob: JobView }) {
  const [job, setJob] = useState<JobView>(initialJob);
  const [step, setStep] = useState<Step>("pick-entity");
  const [entityType, setEntityType] = useState<MigrationEntityType>("DONOR");
  const [csvText, setCsvText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notDone = !DONE_STATUSES.has(job.status) && job.status !== "IMPORTING";

  const handleFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    await runPreview(text, undefined);
    setStep("map");
  };

  const runPreview = async (text: string, requestedMapping: Record<string, string | null> | undefined) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/migrations/${job.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, csvText: text, columnMapping: requestedMapping }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to preview file");
      setPreview(data);
      setMapping(requestedMapping ?? data.suggestedMapping);
      setSkipRows(new Set(data.rows.filter((r: PreviewRow) => r.possibleDuplicate).map((r: PreviewRow) => r.rowNumber)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to preview file");
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = (header: string, key: string | null) => {
    const next = { ...mapping, [header]: key };
    setMapping(next);
    if (csvText) runPreview(csvText, next);
  };

  const toggleSkip = (rowNumber: number) => {
    setSkipRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const commitSource = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/migrations/${job.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, csvText, fileName, columnMapping: mapping, skipRowNumbers: [...skipRows] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to commit file");
      setJob(data.job);
      setStep("review");
      setPreview(null);
      setCsvText("");
      toast.success(`${MIGRATION_ENTITY_LABELS[entityType]} staged for import`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to commit file");
    } finally {
      setLoading(false);
    }
  };

  const runProcessingLoop = useCallback(async () => {
    setProcessing(true);
    try {
      for (;;) {
        const res = await fetch(`/api/merchant/migrations/${job.id}/process`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Import failed");
        setJob(data.job);
        if (DONE_STATUSES.has(data.job.status)) break;
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setProcessing(false);
    }
  }, [job.id]);

  const addAnotherFile = () => {
    setStep("pick-entity");
    setPreview(null);
    setCsvText("");
    setFileName("");
  };

  const progressPct = job.totalRecords > 0 ? Math.round((job.processedRecords / job.totalRecords) * 100) : 0;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/merchant/migrations" className="text-sm text-indigo-600 hover:underline">
          &larr; Migration Center
        </Link>
        <h2 className="mt-2 text-lg font-medium">{MIGRATION_SOURCE_LABELS[job.sourceSystem as MigrationSourceSystem] ?? job.sourceSystem} Migration</h2>
      </div>

      {job.totalRecords > 0 && (
        <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-slate-700">
              {job.status === "COMPLETED"
                ? "Import complete"
                : job.status === "COMPLETED_WITH_ERRORS"
                ? "Import complete, with some errors"
                : job.status === "IMPORTING"
                ? "Importing…"
                : "Staged and ready"}
            </span>
            <span className="text-slate-500">
              {job.processedRecords} / {job.totalRecords}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          {DONE_STATUSES.has(job.status) && (
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> {job.succeededRecords} succeeded
              </span>
              {job.failedRecords > 0 && (
                <span className="flex items-center gap-1 text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> {job.failedRecords} failed
                </span>
              )}
              {job.skippedRecords > 0 && <span>{job.skippedRecords} skipped</span>}
              {job.failedRecords > 0 && (
                <Link href={`/merchant/migrations/${job.id}/reconciliation`} className="text-indigo-600 hover:underline">
                  View reconciliation report
                </Link>
              )}
            </div>
          )}
          {job.status === "READY" && !processing && (
            <div className="mt-4 flex gap-3">
              <button onClick={runProcessingLoop} className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                Start Import
              </button>
              {notDone && (
                <button onClick={addAnotherFile} className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Add another file
                </button>
              )}
            </div>
          )}
          {processing && (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Importing your data — you can leave this page and come back.
            </div>
          )}
        </div>
      )}

      {notDone && step === "pick-entity" && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">What&rsquo;s in this file?</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {MIGRATION_ENTITY_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setEntityType(t)}
                className={`rounded-xl border p-4 text-sm font-medium text-left ${
                  entityType === t ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {MIGRATION_ENTITY_LABELS[t]}
              </button>
            ))}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-8 text-sm font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
          >
            <UploadCloud className="h-5 w-5" /> Upload a CSV file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {notDone && step === "map" && preview && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Match your columns</h3>
          <p className="text-xs text-slate-400 mb-4">{fileName} — {preview.summary.totalRows} rows</p>

          <div className="mb-4 grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
            {preview.headers.map((header) => (
              <div key={header} className="flex items-center gap-2 text-xs">
                <span className="w-1/2 truncate font-medium text-slate-600" title={header}>
                  {header}
                </span>
                <select
                  value={mapping[header] ?? ""}
                  onChange={(e) => updateMapping(header, e.target.value || null)}
                  className="w-1/2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                >
                  <option value="">Don&rsquo;t import</option>
                  {fieldOptionsFor(entityType).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {preview.missingRequiredFields.length > 0 && (
            <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Missing required field(s): {preview.missingRequiredFields.join(", ")}
            </div>
          )}

          <div className="mb-4 flex gap-4 text-xs text-slate-500">
            <span className="text-emerald-600">{preview.summary.validRows} valid</span>
            <span className="text-amber-600">{preview.summary.possibleDuplicates} possible duplicates</span>
            <span className="text-rose-600">{preview.summary.invalidRows} invalid</span>
            {preview.cappedAt && <span>Only the first {preview.cappedAt} rows will be imported</span>}
          </div>

          <div className="mb-4 max-h-72 overflow-y-auto rounded-lg border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Skip</th>
                  <th className="px-3 py-2 text-left">Row</th>
                  <th className="px-3 py-2 text-left">Record</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {preview.rows.slice(0, 200).map((row) => (
                  <tr key={row.rowNumber} className={row.status === "invalid" ? "bg-rose-50/50" : ""}>
                    <td className="px-3 py-1.5">
                      <input type="checkbox" checked={skipRows.has(row.rowNumber)} onChange={() => toggleSkip(row.rowNumber)} disabled={row.status === "invalid"} />
                    </td>
                    <td className="px-3 py-1.5">{row.rowNumber}</td>
                    <td className="px-3 py-1.5">{row.label}</td>
                    <td className="px-3 py-1.5 capitalize">{row.status}</td>
                    <td className="px-3 py-1.5 text-slate-500">{row.errors[0] || row.duplicateReason || row.warnings[0] || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={commitSource}
              disabled={loading || preview.summary.validRows === 0}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Staging…" : `Stage ${preview.summary.totalRows - skipRows.size} rows for import`}
            </button>
            <button onClick={() => setStep("pick-entity")} className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
