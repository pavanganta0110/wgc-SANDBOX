"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, GripVertical } from "lucide-react";
import { DEFAULT_METRICS, METRIC_LABELS } from "@/lib/reports/summaryMetrics";

const ALL_METRIC_KEYS = Object.keys(METRIC_LABELS);
const ROW_SIZE = 4;

export default function CustomizeSummaryPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMetrics = (searchParams.get("metrics")?.split(",").filter(Boolean) ?? DEFAULT_METRICS).slice(
    0,
    ROW_SIZE * 2
  );

  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(currentMetrics);

  const row1 = selected.slice(0, ROW_SIZE);
  const row2 = selected.slice(ROW_SIZE, ROW_SIZE * 2);
  const available = ALL_METRIC_KEYS.filter((key) => !selected.includes(key));

  const removeMetric = (key: string) => setSelected((prev) => prev.filter((k) => k !== key));
  const addMetric = (key: string) => {
    if (selected.length >= ROW_SIZE * 2) return;
    setSelected((prev) => [...prev, key]);
  };

  const handleApply = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("metrics", selected.join(","));
    router.push(`?${params.toString()}`);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setSelected(currentMetrics);
    setIsOpen(false);
  };

  const handleReset = () => setSelected(DEFAULT_METRICS);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Customize summary section"
        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <SlidersHorizontal className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={handleCancel}>
          <div
            className="w-full max-w-md bg-white h-full overflow-y-auto shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Customize Summary Section</h2>
              <button onClick={handleCancel} aria-label="Close">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Your Summary Metrics (Row 1)</h3>
                <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                  {row1.length}/{ROW_SIZE} selected
                </span>
              </div>
              <div className="space-y-2">
                {row1.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50"
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-slate-300" />
                      <span className="text-sm font-medium text-slate-700">
                        {METRIC_LABELS[key]}
                      </span>
                    </div>
                    <button onClick={() => removeMetric(key)} aria-label={`Remove ${METRIC_LABELS[key]}`}>
                      <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Your Summary Metrics (Row 2)</h3>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {row2.length}/{ROW_SIZE} selected
                </span>
              </div>
              {row2.length > 0 ? (
                <div className="space-y-2">
                  {row2.map((key) => (
                    <div
                      key={key}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-slate-300" />
                        <span className="text-sm font-medium text-slate-700">
                          {METRIC_LABELS[key]}
                        </span>
                      </div>
                      <button onClick={() => removeMetric(key)} aria-label={`Remove ${METRIC_LABELS[key]}`}>
                        <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => {}}
                  className="w-full border border-dashed border-slate-200 rounded-xl py-6 text-sm text-slate-400"
                  disabled
                >
                  Add {ROW_SIZE} additional metrics (optional)
                </button>
              )}
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Available Metrics</h3>
              <div className="space-y-1">
                {available.map((key) => (
                  <div key={key} className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-700">{METRIC_LABELS[key]}</span>
                    <button
                      onClick={() => addMetric(key)}
                      disabled={selected.length >= ROW_SIZE * 2}
                      className="text-sm font-semibold text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-100">
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-xl border border-blue-200 text-sm font-semibold text-blue-600 hover:bg-blue-50"
              >
                Reset to Default
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={row1.length !== ROW_SIZE}
                  className="px-4 py-2 rounded-xl bg-slate-200 text-sm font-semibold text-slate-500 disabled:opacity-60 enabled:bg-[#eab308] enabled:text-slate-900"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
