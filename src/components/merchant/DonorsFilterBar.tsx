"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, ChevronDown, SlidersHorizontal, X, Columns3 } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import { DONOR_COLUMNS, parseVisibleDonorColumns, type DonorColumnKey } from "@/lib/donorColumns";
import { DONOR_DISPLAY_STATUS_LABELS, type DonorDisplayStatus } from "@/lib/donors/donorStatus";

const STATUSES = Object.keys(DONOR_DISPLAY_STATUS_LABELS) as DonorDisplayStatus[];

export default function DonorsFilterBar({ exportHref }: { exportHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") || "";
  const [searchInput, setSearchInput] = useState(q);
  const status = searchParams.get("status") || "";
  const recurring = searchParams.get("recurring") === "1";
  const paymentMethod = searchParams.get("paymentMethod") || "";
  const minTotal = searchParams.get("minTotal") || "";
  const maxTotal = searchParams.get("maxTotal") || "";
  const hasFailedPayment = searchParams.get("hasFailedPayment") === "1";
  const hasRefund = searchParams.get("hasRefund") === "1";
  const hasBankReturn = searchParams.get("hasBankReturn") === "1";
  const hasDispute = searchParams.get("hasDispute") === "1";
  const hasActiveSubscription = searchParams.get("hasActiveSubscription") === "1";
  const archived = searchParams.get("archived") || "active";
  const visibleCols = parseVisibleDonorColumns(searchParams.get("cols") || undefined);

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isColsOpen, setIsColsOpen] = useState(false);

  // Debounced search — filtering itself always happens server-side on submit.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== q) setParam("q", searchInput);
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const activeFilterCount =
    [status, paymentMethod, minTotal, maxTotal].filter(Boolean).length +
    (recurring ? 1 : 0) +
    (hasFailedPayment ? 1 : 0) +
    (hasRefund ? 1 : 0) +
    (hasBankReturn ? 1 : 0) +
    (hasDispute ? 1 : 0) +
    (hasActiveSubscription ? 1 : 0) +
    (archived !== "active" ? 1 : 0);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("id");
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  const toggleParam = (key: string, current: boolean) => setParam(key, current ? "" : "1");

  const clearFilters = () => {
    const params = new URLSearchParams();
    for (const keep of ["cols"]) {
      const v = searchParams.get(keep);
      if (v) params.set(keep, v);
    }
    setSearchInput("");
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const toggleColumn = (key: DonorColumnKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === DONOR_COLUMNS.length) params.delete("cols");
    else params.set("cols", [...next].join(","));
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <DateRangePicker />

      <input
        type="text"
        placeholder="Search name, email, phone, or donor ID"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-64"
      />

      <div className="relative">
        <button
          onClick={() => setIsStatusOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isStatusOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {status ? DONOR_DISPLAY_STATUS_LABELS[status as DonorDisplayStatus] : "Status"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isStatusOpen ? "rotate-180" : ""}`} />
        </button>
        {isStatusOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStatusOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-48">
              <button onClick={() => { setParam("status", ""); setIsStatusOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                All Statuses
              </button>
              {STATUSES.map((s) => (
                <button key={s} onClick={() => { setParam("status", s); setIsStatusOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {DONOR_DISPLAY_STATUS_LABELS[s]}
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
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-80 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setParam("paymentMethod", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                >
                  <option value="">Any</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Min Total ($)</label>
                  <input
                    type="text"
                    value={minTotal}
                    onChange={(e) => setParam("minTotal", e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Max Total ($)</label>
                  <input
                    type="text"
                    value={maxTotal}
                    onChange={(e) => setParam("maxTotal", e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Archived Status</label>
                <select
                  value={archived}
                  onChange={(e) => setParam("archived", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                >
                  <option value="active">Active Only</option>
                  <option value="archived">Archived Only</option>
                  <option value="all">All</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={recurring} onChange={() => toggleParam("recurring", recurring)} />
                Has active recurring donation
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={hasFailedPayment} onChange={() => toggleParam("hasFailedPayment", hasFailedPayment)} />
                Has failed payment
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={hasRefund} onChange={() => toggleParam("hasRefund", hasRefund)} />
                Has refund
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={hasBankReturn} onChange={() => toggleParam("hasBankReturn", hasBankReturn)} />
                Has bank return
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={hasDispute} onChange={() => toggleParam("hasDispute", hasDispute)} />
                Has dispute
              </label>
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
                {DONOR_COLUMNS.map((c) => (
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
