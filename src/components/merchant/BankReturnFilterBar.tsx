"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Download, ChevronDown, SlidersHorizontal, X, Columns3, List } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import { BANK_RETURN_COLUMNS, parseVisibleBankReturnColumns, type BankReturnColumnKey } from "@/lib/bankReturnColumns";

export default function BankReturnFilterBar({ exportHref }: { exportHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const last4 = searchParams.get("last4") || "";
  const amount = searchParams.get("amount") || "";
  const buyer = searchParams.get("buyer") || "";
  const org = searchParams.get("org") || "";
  const visibleCols = parseVisibleBankReturnColumns(searchParams.get("cols") || undefined);

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isColsOpen, setIsColsOpen] = useState(false);

  const activeFilterCount = [last4, amount, buyer, org].filter(Boolean).length;

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

  const toggleColumn = (key: BankReturnColumnKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === BANK_RETURN_COLUMNS.length) params.delete("cols");
    else params.set("cols", [...next].join(","));
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <DateRangePicker />

      {/* Last Four */}
      <input
        type="text"
        placeholder="Last Four"
        value={last4}
        maxLength={4}
        onChange={(e) => setParam("last4", e.target.value.replace(/\D/g, ""))}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-28"
      />

      {/* Amount */}
      <input
        type="text"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setParam("amount", e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-28"
      />

      {/* Buyer Name */}
      <input
        type="text"
        placeholder="Buyer Name"
        value={buyer}
        onChange={(e) => setParam("buyer", e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-40"
      />

      {/* Additional filters (Organization/Church name) */}
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
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Organization / Church
                </label>
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

      {/* Clear filters */}
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

        {/* Column settings */}
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
                {BANK_RETURN_COLUMNS.map((c) => (
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
