"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { CSV_COLUMN_GROUPS, EXPORT_PRESETS, PDF_SECTIONS } from "@/lib/exports/transactionExportOptions";

type Format = "csv" | "pdf";

const STORAGE_KEY = (format: Format) => `wgc_payments_export_${format}`;

function readSaved(format: Format, allowed: readonly string[]): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(format));
    const saved = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(saved)) return null;
    const keys = saved.filter((k): k is string => typeof k === "string" && allowed.includes(k));
    return keys.length ? keys : null;
  } catch {
    return null;
  }
}

/**
 * Asks what to include before a Payments export downloads; the file then
 * contains only that. CSV picks column groups, PDF picks report sections
 * (both validated again server-side against transactionExportOptions).
 */
export default function ExportOptionsDialog({
  format,
  exportUrl,
  onClose,
}: {
  format: Format;
  /** The export endpoint with the page's current filters already applied. */
  exportUrl: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const options = format === "csv" ? CSV_COLUMN_GROUPS : PDF_SECTIONS;
  const presets = EXPORT_PRESETS[format];
  const allKeys = options.map((o) => o.key as string);
  const [selected, setSelected] = useState<string[]>(() => [...presets[0].groups]);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
    const saved = readSaved(format, allKeys);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage after mount
    if (saved) setSelected(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: string) => setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const activePreset = presets.find((p) => p.groups.length === selected.length && p.groups.every((g) => selected.includes(g)))?.key;

  function download() {
    if (selected.length === 0) return;
    // Keep the page's order, not click order.
    const ordered = allKeys.filter((k) => selected.includes(k));
    try {
      localStorage.setItem(STORAGE_KEY(format), JSON.stringify(ordered));
    } catch {
      // Remembering the choice is a convenience only.
    }
    const url = new URL(exportUrl, window.location.origin);
    url.searchParams.set(format === "csv" ? "columns" : "sections", ordered.join(","));
    window.location.href = url.pathname + url.search;
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="export-options-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 text-slate-700 shadow-2xl backdrop:bg-slate-900/50"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2 id="export-options-title" className="text-base font-bold text-slate-900">
              Export {format === "csv" ? "CSV" : "PDF"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Choose what to include. Your current filters apply.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <div role="group" aria-label="Presets" className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelected([...p.groups])}
                aria-pressed={activePreset === p.key}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  activePreset === p.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <fieldset className="space-y-1">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {format === "csv" ? "Columns" : "Sections"}
            </legend>
            {options.map((o) => (
              <label key={o.key} className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(o.key)}
                  onChange={() => toggle(o.key)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{o.label}</span>
                  <span className="block text-xs text-slate-500">{o.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
          {selected.length === 0 && <p className="mr-auto text-xs text-rose-600">Choose at least one.</p>}
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={download}
            disabled={selected.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download {format === "csv" ? "CSV" : "PDF"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
