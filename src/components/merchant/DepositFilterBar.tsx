"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Download, ChevronDown, SlidersHorizontal, X, Columns3, List } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import { DEPOSIT_COLUMNS, parseVisibleDepositColumns, type DepositColumnKey } from "@/lib/depositColumns";

const STATES = ["PENDING", "PROCESSING", "SENT", "COMPLETED", "FAILED", "RETURNED", "CANCELED"];

function titleCase(s: string) {
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export default function DepositFilterBar({ exportHref }: { exportHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = searchParams.get("state") || "";
  const amount = searchParams.get("amount") || "";
  const org = searchParams.get("org") || "";
  const visibleCols = parseVisibleDepositColumns(searchParams.get("cols") || undefined);

  const [isStateOpen, setIsStateOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isColsOpen, setIsColsOpen] = useState(false);

  const activeFilterCount = [state, amount, org].filter(Boolean).length;

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("id");
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    const cols = searchParams.get("cols");
    if (cols) params.set("cols", cols);
    router.push(cols ? `?${params.toString()}` : pathname);
  };

  const toggleColumn = (key: DepositColumnKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === DEPOSIT_COLUMNS.length) params.delete("cols");
    else params.set("cols", [...next].join(","));
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <DateRangePicker />

      {/* State filter */}
      <div className="relative">
        <button
          onClick={() => setIsStateOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isStateOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {state ? titleCase(state) : "State"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isStateOpen ? "rotate-180" : ""}`} />
        </button>
        {isStateOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStateOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-48">
              <button
                onClick={() => { setParam("state", ""); setIsStateOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                All States
              </button>
              {STATES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setParam("state", s); setIsStateOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {titleCase(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Deposit Amount */}
      <input
        type="text"
        placeholder="Deposit Amount"
        value={amount}
        onChange={(e) => setParam("amount", e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-40"
      />

      {/* Additional filters (Organization) */}
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
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-64 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Organization / Church</label>
                <input
                  type="text"
                  placeholder="Organization name"
                  value={org}
                  onChange={(e) => setParam("org", e.target.value)}
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
        <button
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
          title="Table view"
        >
          <List className="w-4 h-4" />
        </button>

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
              <div className="absolute right-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-56">
                {DEPOSIT_COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
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
