"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import { IMPORT_FIELD_KEYS, IMPORT_FIELD_LABELS, REQUIRED_IMPORT_FIELDS, type ImportFieldKey } from "@/lib/donations/externalDonationImport";
import { formatCents } from "@/lib/format";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const STEP_LABELS = ["Upload file", "Map columns", "Validate & preview", "Resolve funds", "Confirm", "Results"];

interface PreviewRow {
  rowNumber: number;
  input: Record<string, string | null>;
  status: "valid" | "warning" | "invalid" | "duplicate";
  errors: string[];
  warnings: string[];
  amountCents: number | null;
  donationDateISO: string | null;
  fund: string | null;
  fundResolved: boolean;
  donorResolution: "MATCHED_EXISTING" | "CREATED_NEW" | "ANONYMOUS" | "UNMATCHED";
  possibleDuplicate: boolean;
  duplicateReason: string | null;
}

interface PreviewResponse {
  headers: string[];
  suggestedMapping: Record<string, ImportFieldKey | null>;
  mapping: Record<string, ImportFieldKey | null>;
  missingRequiredFields: string[];
  duplicateMappedFields: string[];
  rows: PreviewRow[];
  unresolvedFunds: string[];
  summary: {
    totalRows: number;
    validRows: number;
    warningRows: number;
    invalidRows: number;
    possibleDuplicates: number;
    totalAmountCents: number;
  };
  cappedAt: number | null;
}

type FundAction = "use_existing" | "create" | "none";

function downloadText(filename: string, text: string, mime = "text/csv") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const STATUS_PILL: Record<PreviewRow["status"], string> = {
  valid: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  invalid: "bg-red-50 text-red-700",
  duplicate: "bg-orange-50 text-orange-700",
};

export default function ExternalDonationImportWizard({ canManageFunds }: { canManageFunds: boolean }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);

  // Step 1
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [csvText, setCsvText] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);

  // Step 2
  const [mapping, setMapping] = useState<Record<string, ImportFieldKey | null>>({});
  const [headers, setHeaders] = useState<string[]>([]);

  // Step 3
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [skipRowNumbers, setSkipRowNumbers] = useState<Set<number>>(new Set());

  // Step 4
  const [funds, setFunds] = useState<{ id: string; name: string }[] | null>(null);
  const [fundResolutions, setFundResolutions] = useState<Record<string, { action: FundAction; fundId?: string }>>({});

  // Step 5
  const [receiptOption, setReceiptOption] = useState<"NONE" | "AFTER_IMPORT" | "ONLY_FLAGGED" | "REVIEW_BEFORE_SENDING">("NONE");

  // Step 6
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{
    batch: { id: string; startedAt: string | null; completedAt: string | null };
    successRows: number;
    failedRows: number;
    skippedRows: number;
    totalAmountCents: number;
    newDonorsCreated: number;
    donorsMatched: number;
    receiptsQueued: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/merchant/funds")
      .then((res) => (res.ok ? res.json() : { funds: [] }))
      .then((json) => setFunds((json.funds || []).filter((f: { isActive: boolean }) => f.isActive)))
      .catch(() => setFunds([]));
  }, []);

  async function handleFile(file: File) {
    setFileError(null);
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv" && file.type !== "text/plain") {
      setFileError("Please upload a .csv file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("This file is larger than the 5MB limit. Please split it into smaller files.");
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setFileSize(file.size);
    setCsvText(text);
  }

  function removeFile() {
    setFileName(null);
    setFileSize(0);
    setCsvText("");
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function goToMapping() {
    if (!csvText.trim()) {
      toast.error("Upload a CSV file first");
      return;
    }
    try {
      const res = await fetch("/api/merchant/donations/external/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not read this file");
        return;
      }
      setHeaders(json.headers);
      setMapping(json.suggestedMapping);
      setStep(2);
    } catch {
      toast.error("Could not read this file. Please try again.");
    }
  }

  const mappedFieldCounts = new Map<ImportFieldKey, number>();
  for (const key of Object.values(mapping)) {
    if (key) mappedFieldCounts.set(key, (mappedFieldCounts.get(key) ?? 0) + 1);
  }
  const duplicateFields = [...mappedFieldCounts.entries()].filter(([, c]) => c > 1).map(([k]) => k);
  const missingRequired = REQUIRED_IMPORT_FIELDS.filter((f) => !Object.values(mapping).includes(f));

  async function runPreview() {
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/merchant/donations/external/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, columnMapping: mapping }),
      });
      const json: PreviewResponse = await res.json();
      if (!res.ok) {
        toast.error((json as unknown as { error?: string }).error || "Could not validate this file");
        return;
      }
      setPreview(json);
      setSkipRowNumbers(new Set(json.rows.filter((r) => r.possibleDuplicate).map((r) => r.rowNumber)));
      const initialFundResolutions: Record<string, { action: FundAction; fundId?: string }> = {};
      for (const fund of json.unresolvedFunds) initialFundResolutions[fund] = { action: "none" };
      setFundResolutions(initialFundResolutions);
      setStep(3);
    } catch {
      toast.error("Could not validate this file. Please try again.");
    } finally {
      setLoadingPreview(false);
    }
  }

  function downloadRejectedRows() {
    if (!preview) return;
    const rejected = preview.rows.filter((r) => r.status === "invalid");
    const header = ["Row", "Errors", ...IMPORT_FIELD_KEYS.map((k) => IMPORT_FIELD_LABELS[k])].join(",");
    const lines = rejected.map((r) =>
      [String(r.rowNumber), csvEscape(r.errors.join("; ")), ...IMPORT_FIELD_KEYS.map((k) => csvEscape(r.input[k] || ""))].join(",")
    );
    downloadText("rejected-rows.csv", [header, ...lines].join("\n"));
  }

  async function handleCommit() {
    if (!preview) return;
    setCommitting(true);
    try {
      const res = await fetch("/api/merchant/donations/external/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          fileName,
          columnMapping: mapping,
          fundResolutions,
          skipRowNumbers: [...skipRowNumbers],
          receiptOption,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Import failed");
        return;
      }
      setResult(json);
      setStep(6);
      toast.success("Import complete");
    } catch {
      toast.error("Import failed. Please try again.");
    } finally {
      setCommitting(false);
    }
  }

  function downloadResults() {
    if (!result) return;
    const lines = [
      "Metric,Value",
      `Successfully imported,${result.successRows}`,
      `Failed,${result.failedRows}`,
      `Skipped,${result.skippedRows}`,
      `New donors created,${result.newDonorsCreated}`,
      `Existing donors matched,${result.donorsMatched}`,
      `Receipts queued,${result.receiptsQueued}`,
      `Total imported amount,${(result.totalAmountCents / 100).toFixed(2)}`,
    ];
    downloadText(`import-results-${result.batch.id}.csv`, lines.join("\n"));
  }

  const includedRows = preview ? preview.rows.filter((r) => r.status !== "invalid" && !skipRowNumbers.has(r.rowNumber)) : [];
  const acceptedDuplicates = preview ? preview.rows.filter((r) => r.possibleDuplicate && !skipRowNumbers.has(r.rowNumber)).length : 0;
  const excludedDuplicates = preview ? preview.rows.filter((r) => r.possibleDuplicate && skipRowNumbers.has(r.rowNumber)).length : 0;
  const totalIncludedAmountCents = includedRows.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const newDonorsPreview = includedRows.filter((r) => r.donorResolution === "CREATED_NEW").length;
  const matchedDonorsPreview = includedRows.filter((r) => r.donorResolution === "MATCHED_EXISTING").length;
  const receiptsRequestedPreview =
    receiptOption === "NONE"
      ? 0
      : receiptOption === "AFTER_IMPORT"
        ? includedRows.filter((r) => r.donorResolution !== "ANONYMOUS" && r.donorResolution !== "UNMATCHED").length
        : receiptOption === "ONLY_FLAGGED"
          ? includedRows.filter((r) => r.input.sendReceipt?.toLowerCase() === "yes" || r.input.sendReceipt?.toLowerCase() === "true").length
          : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/merchant/donations/external" className="text-xs font-semibold text-slate-500 hover:underline">
          ← External Donations
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mt-2">Import Donations</h1>
      </div>

      <nav aria-label="Import steps" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1.5 ${n === step ? "bg-[#010409] text-white" : n < step ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
              >
                {n}. {label}
              </span>
              {n < STEP_LABELS.length && <span className="text-slate-300">→</span>}
            </div>
          );
        })}
      </nav>

      {step === 1 && (
        <section className="rounded-xl border border-slate-100 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Step 1 — Upload file</h2>
          <p className="text-sm text-slate-500">
            Accepted file type: CSV. Maximum file size: 5MB. Not sure what columns to use?{" "}
            <a href={`/api/merchant/donations/external/import/template`} className="text-blue-600 hover:underline">
              Download a sample template
            </a>
            .
          </p>

          {!fileName ? (
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border-2 border-dashed border-slate-200 py-10 text-sm text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              >
                Click to choose a CSV file
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
              {fileError && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {fileError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <div className="text-sm">
                <p className="font-semibold text-slate-900">{fileName}</p>
                <p className="text-xs text-slate-400">{(fileSize / 1024).toFixed(1)} KB</p>
              </div>
              <button onClick={removeFile} className="text-xs font-semibold text-red-600 hover:underline">
                Remove
              </button>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={goToMapping}
              disabled={!fileName}
              className="rounded-lg bg-[#010409] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-xl border border-slate-100 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Step 2 — Map columns</h2>
          <p className="text-sm text-slate-500">
            We matched common column names automatically. Review each mapping below, or choose &ldquo;Skip this column&rdquo; for anything you
            don&apos;t want to import. Required fields are marked with an asterisk.
          </p>

          {missingRequired.length > 0 && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              Missing required field{missingRequired.length > 1 ? "s" : ""}: {missingRequired.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}. Map a
              column to continue.
            </div>
          )}
          {duplicateFields.length > 0 && (
            <div role="alert" className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              These fields are mapped from more than one column — only the last one will be used:{" "}
              {duplicateFields.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Your column</th>
                  <th className="text-left px-4 py-2">Maps to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {headers.map((header) => (
                  <tr key={header}>
                    <td className="px-4 py-2 font-medium text-slate-700">{header}</td>
                    <td className="px-4 py-2">
                      <select
                        value={mapping[header] || ""}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [header]: (e.target.value || null) as ImportFieldKey | null }))}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      >
                        <option value="">Skip this column</option>
                        {IMPORT_FIELD_KEYS.map((key) => (
                          <option key={key} value={key}>
                            {IMPORT_FIELD_LABELS[key]}
                            {REQUIRED_IMPORT_FIELDS.includes(key) ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600">
              Back
            </button>
            <button
              onClick={runPreview}
              disabled={missingRequired.length > 0 || loadingPreview}
              className="rounded-lg bg-[#010409] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {loadingPreview ? "Validating…" : "Continue"}
            </button>
          </div>
        </section>
      )}

      {step === 3 && preview && (
        <section className="rounded-xl border border-slate-100 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Step 3 — Validate & preview</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              ["Total rows", preview.summary.totalRows, "text-slate-900"],
              ["Valid", preview.summary.validRows, "text-emerald-600"],
              ["Warnings", preview.summary.warningRows, "text-amber-600"],
              ["Invalid", preview.summary.invalidRows, "text-red-600"],
              ["Possible duplicates", preview.summary.possibleDuplicates, "text-orange-600"],
              ["Total amount", formatCents(preview.summary.totalAmountCents), "text-slate-900"],
            ].map(([label, value, color]) => (
              <div key={label as string} className="bg-slate-50 rounded-lg p-3 text-center">
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {preview.summary.invalidRows > 0 && (
            <button onClick={downloadRejectedRows} className="text-sm font-semibold text-blue-600 hover:underline">
              Download rejected rows and error messages
            </button>
          )}

          <div className="max-h-96 overflow-auto border border-slate-100 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Row</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Donor</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="text-left px-3 py-2">Include</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {preview.rows.slice(0, 500).map((row) => (
                  <tr key={row.rowNumber} className={row.status === "invalid" ? "opacity-60" : ""}>
                    <td className="px-3 py-2 text-slate-400">{row.rowNumber}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_PILL[row.status]}`}>{row.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      {row.input.donorFirstName || row.input.donorLastName
                        ? `${row.input.donorFirstName || ""} ${row.input.donorLastName || ""}`.trim()
                        : row.input.donorEmail || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{row.amountCents != null ? formatCents(row.amountCents) : "—"}</td>
                    <td className="px-3 py-2">{row.donationDateISO ? formatCalendarDateUTC(row.donationDateISO) : "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-xs">
                      {[...row.errors, ...row.warnings, row.duplicateReason].filter(Boolean).join("; ")}
                    </td>
                    <td className="px-3 py-2">
                      {row.status !== "invalid" && (
                        <label className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={!skipRowNumbers.has(row.rowNumber)}
                            onChange={(e) =>
                              setSkipRowNumbers((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.delete(row.rowNumber);
                                else next.add(row.rowNumber);
                                return next;
                              })
                            }
                          />
                          Include
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 500 && <p className="text-xs text-slate-400">Showing the first 500 of {preview.rows.length} rows.</p>}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600">
              Back
            </button>
            <button onClick={() => setStep(4)} className="rounded-lg bg-[#010409] px-5 py-2.5 text-sm font-semibold text-white">
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 4 && preview && (
        <section className="rounded-xl border border-slate-100 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Step 4 — Resolve funds and donors</h2>

          {preview.unresolvedFunds.length === 0 ? (
            <p className="text-sm text-slate-500">Every fund in this file already matches your fund catalog. Nothing to resolve.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">These fund names in your file don&apos;t match your existing funds. Choose what to do with each:</p>
              {preview.unresolvedFunds.map((fund) => (
                <div key={fund} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
                  <span className="text-sm font-medium text-slate-900">{fund}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <select
                      value={fundResolutions[fund]?.action || "none"}
                      onChange={(e) =>
                        setFundResolutions((prev) => ({ ...prev, [fund]: { action: e.target.value as FundAction, fundId: prev[fund]?.fundId } }))
                      }
                      className="rounded-lg border border-slate-200 px-2 py-1.5"
                    >
                      <option value="none">Import without a fund</option>
                      <option value="use_existing">Map to an existing fund</option>
                      {canManageFunds && <option value="create">Create a new fund</option>}
                    </select>
                    {fundResolutions[fund]?.action === "use_existing" && (
                      <select
                        value={fundResolutions[fund]?.fundId || ""}
                        onChange={(e) => setFundResolutions((prev) => ({ ...prev, [fund]: { action: "use_existing", fundId: e.target.value } }))}
                        className="rounded-lg border border-slate-200 px-2 py-1.5"
                      >
                        <option value="">Select a fund…</option>
                        {funds?.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900 mb-1">Donors</p>
            <p>
              {matchedDonorsPreview} row{matchedDonorsPreview === 1 ? "" : "s"} matched an existing donor by email. {newDonorsPreview} new donor
              {newDonorsPreview === 1 ? "" : "s"} will be created. Matching never merges on name alone — only a matching email (or, if no email,
              phone) counts as a match.
            </p>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600">
              Back
            </button>
            <button onClick={() => setStep(5)} className="rounded-lg bg-[#010409] px-5 py-2.5 text-sm font-semibold text-white">
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 5 && preview && (
        <section className="rounded-xl border border-slate-100 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Step 5 — Import confirmation</h2>

          <div>
            <p className="text-sm font-semibold text-slate-900 mb-2">Receipts</p>
            <div className="space-y-2 text-sm">
              {[
                ["NONE", "Do not send receipts"],
                ["AFTER_IMPORT", "Send receipts to every donor with an email after import"],
                ["ONLY_FLAGGED", 'Send receipts only where the file\'s "Send Receipt" column is yes'],
                ["REVIEW_BEFORE_SENDING", "Queue receipts, but let me review before sending"],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input type="radio" name="receiptOption" checked={receiptOption === value} onChange={() => setReceiptOption(value as typeof receiptOption)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm rounded-lg bg-slate-50 p-4">
            <div>
              <dt className="text-xs text-slate-400">Donations to import</dt>
              <dd className="font-semibold text-slate-900">{includedRows.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Total amount</dt>
              <dd className="font-semibold text-slate-900">{formatCents(totalIncludedAmountCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">New donors to be created</dt>
              <dd className="font-semibold text-slate-900">{newDonorsPreview}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Existing donors matched</dt>
              <dd className="font-semibold text-slate-900">{matchedDonorsPreview}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Funds used</dt>
              <dd className="font-semibold text-slate-900">{new Set(includedRows.map((r) => r.fund).filter(Boolean)).size}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Receipts requested</dt>
              <dd className="font-semibold text-slate-900">{receiptsRequestedPreview}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Rows skipped</dt>
              <dd className="font-semibold text-slate-900">{preview.rows.length - includedRows.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Possible duplicates</dt>
              <dd className="font-semibold text-slate-900">
                {acceptedDuplicates} accepted, {excludedDuplicates} excluded
              </dd>
            </div>
          </dl>

          <div className="flex justify-between">
            <button onClick={() => setStep(4)} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600">
              Back
            </button>
            <button
              onClick={handleCommit}
              disabled={committing || includedRows.length === 0}
              className="rounded-lg bg-[#010409] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {committing ? "Importing…" : `Import ${includedRows.length} Donation${includedRows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}

      {step === 6 && result && (
        <section className="rounded-xl border border-slate-100 bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Step 6 — Import results</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-emerald-700">{result.successRows}</p>
              <p className="text-xs text-emerald-700">Imported</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-red-700">{result.failedRows}</p>
              <p className="text-xs text-red-700">Failed</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-700">{result.skippedRows}</p>
              <p className="text-xs text-slate-600">Skipped</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-slate-900">{formatCents(result.totalAmountCents)}</p>
              <p className="text-xs text-slate-500">Total imported</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-400">New donor records created</dt>
              <dd className="font-semibold text-slate-900">{result.newDonorsCreated}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Existing donors matched</dt>
              <dd className="font-semibold text-slate-900">{result.donorsMatched}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Receipts queued</dt>
              <dd className="font-semibold text-slate-900">{result.receiptsQueued}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Started / completed</dt>
              <dd className="font-semibold text-slate-900">
                {result.batch.startedAt ? new Date(result.batch.startedAt).toLocaleTimeString() : "—"} –{" "}
                {result.batch.completedAt ? new Date(result.batch.completedAt).toLocaleTimeString() : "—"}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3">
            <button onClick={downloadResults} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
              Download results
            </button>
            {result.failedRows > 0 && (
              <button onClick={downloadRejectedRows} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                Download error rows
              </button>
            )}
            <Link
              href={`/merchant/donations/external/import/history/${result.batch.id}`}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
            >
              View row-level results
            </Link>
            <button onClick={() => router.push("/merchant/donations/external")} className="ml-auto rounded-lg bg-[#010409] px-5 py-2.5 text-sm font-semibold text-white">
              Done
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
