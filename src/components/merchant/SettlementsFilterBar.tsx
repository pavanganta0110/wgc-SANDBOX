"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Download, ChevronDown, SlidersHorizontal, X, Columns3 } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import { SETTLEMENT_COLUMNS, parseVisibleSettlementColumns, type SettlementColumnKey } from "@/lib/settlementColumns";
import { SETTLEMENT_FILTER_STATUSES, getSettlementStatusLabel } from "@/lib/finix/settlementStatus";

const STATUSES = SETTLEMENT_FILTER_STATUSES;
const DEPOSIT_STATUSES = [
  { value: "linked", label: "Linked to Deposit" },
  { value: "unlinked", label: "Not Yet Linked" },
];
const RECONCILIATION_STATUSES = [
  { value: "UNRECONCILED", label: "Unreconciled" },
  { value: "PARTIALLY_RECONCILED", label: "Partially Reconciled" },
  { value: "RECONCILED", label: "Reconciled" },
  { value: "MISMATCH", label: "Mismatch" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
];

export default function SettlementsFilterBar({ exportHref }: { exportHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") || "";
  const depositStatus = searchParams.get("depositStatus") || "";
  const reconciliationStatus = searchParams.get("reconciliationStatus") || "";
  const minGross = searchParams.get("minGross") || "";
  const maxGross = searchParams.get("maxGross") || "";
  const traceId = searchParams.get("traceId") || "";
  const visibleCols = parseVisibleSettlementColumns(searchParams.get("cols") || undefined);

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isColsOpen, setIsColsOpen] = useState(false);

  const activeFilterCount = [status, depositStatus, reconciliationStatus, minGross, maxGross, traceId].filter(Boolean).length;

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("id");
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    for (const keep of ["cols"]) {
      const v = searchParams.get(keep);
      if (v) params.set(keep, v);
    }
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const toggleColumn = (key: SettlementColumnKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === SETTLEMENT_COLUMNS.length) params.delete("cols");
    else params.set("cols", [...next].join(","));
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <DateRangePicker />

      <div className="relative">
        <button
          onClick={() => setIsStatusOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isStatusOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {status ? getSettlementStatusLabel(status) : "Status"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isStatusOpen ? "rotate-180" : ""}`} />
        </button>
        {isStatusOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStatusOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-48 max-h-80 overflow-y-auto">
              <button onClick={() => { setParam("status", ""); setIsStatusOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                All Statuses
              </button>
              {STATUSES.map((s) => (
                <button key={s} onClick={() => { setParam("status", s); setIsStatusOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {getSettlementStatusLabel(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setIsMoreOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isMoreOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Additional Filters
        </button>
        {isMoreOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsMoreOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-72 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Deposit Status</label>
                <select
                  value={depositStatus}
                  onChange={(e) => setParam("depositStatus", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                >
                  <option value="">Any</option>
                  {DEPOSIT_STATUSES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Reconciliation Status</label>
                <select
                  value={reconciliationStatus}
                  onChange={(e) => setParam("reconciliationStatus", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                >
                  <option value="">Any</option>
                  {RECONCILIATION_STATUSES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Min Gross ($)</label>
                  <input
                    type="text"
                    value={minGross}
                    onChange={(e) => setParam("minGross", e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Max Gross ($)</label>
                  <input
                    type="text"
                    value={maxGross}
                    onChange={(e) => setParam("maxGross", e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Trace ID</label>
                <input
                  type="text"
                  value={traceId}
                  onChange={(e) => setParam("traceId", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {activeFilterCount > 0 && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-3.5 h-3.5" />
          Clear Filters
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setIsColsOpen((o) => !o)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Columns3 className="w-4 h-4" />
            Columns
          </button>
          {isColsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsColsOpen(false)} />
              <div className="absolute right-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-56 max-h-96 overflow-y-auto">
                {SETTLEMENT_COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleColumn(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {exportHref && (
          <a
            href={`${exportHref}?${searchParams.toString()}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Export
          </a>
        )}
      </div>
    </div>
  );
}
