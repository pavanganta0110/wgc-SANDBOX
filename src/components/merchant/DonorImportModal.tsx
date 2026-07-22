"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { X, Upload } from "lucide-react";

interface PreviewRow {
  rowNumber: number;
  input: { name: string | null; email: string | null; phone: string | null };
  status: "valid" | "error" | "duplicate_in_file" | "duplicate_in_org";
  errors: string[];
}

interface PreviewSummary {
  valid: number;
  error: number;
  duplicateInFile: number;
  duplicateInOrg: number;
}

const STATUS_LABELS: Record<PreviewRow["status"], string> = {
  valid: "Ready to import",
  error: "Error",
  duplicate_in_file: "Duplicate in file",
  duplicate_in_org: "Already a donor",
};

const STATUS_COLORS: Record<PreviewRow["status"], string> = {
  valid: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700",
  duplicate_in_file: "bg-amber-50 text-amber-700",
  duplicate_in_org: "bg-slate-100 text-slate-600",
};

export default function DonorImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/merchant/donors/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read CSV");
      setRows(data.rows);
      setSummary(data.summary);
    } catch (err: any) {
      toast.error(err.message || "Failed to read CSV");
      setCsvText(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const runImport = async () => {
    if (!csvText) return;
    setImporting(true);
    try {
      const res = await fetch("/api/merchant/donors/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      toast.success(
        `${data.created} created${data.updated ? `, ${data.updated} updated` : ""}${data.reused ? `, ${data.reused} reused` : ""}${data.rejected ? `, ${data.rejected} rejected` : ""}${data.failed?.length ? `, ${data.failed.length} failed` : ""}`
      );
      router.refresh();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Import Donors from CSV</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {!csvText ? (
            <div>
              <p className="text-sm text-slate-500 mb-3">
                Upload a CSV file with columns for Name, Email, Phone, and optionally Address, City, State, Postal Code, and Company. At least one of email or phone is required per row.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 w-full justify-center"
              >
                <Upload className="w-4 h-4" />
                Choose CSV File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          ) : loadingPreview ? (
            <p className="text-sm text-slate-400 text-center py-10">Reading {fileName}…</p>
          ) : (
            <div>
              <p className="text-sm text-slate-600 mb-3">{fileName}</p>
              {summary && (
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <SummaryChip label="Ready" value={summary.valid} color="text-emerald-700" />
                  <SummaryChip label="Errors" value={summary.error} color="text-red-700" />
                  <SummaryChip label="Dup. in file" value={summary.duplicateInFile} color="text-amber-700" />
                  <SummaryChip label="Already exist" value={summary.duplicateInOrg} color="text-slate-500" />
                </div>
              )}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r) => (
                      <tr key={r.rowNumber} className="border-t border-slate-50">
                        <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                        <td className="px-3 py-2 text-slate-800">{r.input.name || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{r.input.email || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[r.status]}`}>
                            {STATUS_LABELS[r.status]}
                            {r.errors.length > 0 ? `: ${r.errors.join(", ")}` : ""}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 100 && <p className="text-xs text-slate-400 mt-2">Showing first 100 of {rows.length} rows.</p>}
            </div>
          )}
        </div>

        {csvText && !loadingPreview && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              onClick={() => {
                setCsvText(null);
                setRows([]);
                setSummary(null);
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              Choose Different File
            </button>
            <button
              onClick={runImport}
              disabled={importing || !summary || summary.valid === 0}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${summary?.valid ?? 0} Donor(s)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
