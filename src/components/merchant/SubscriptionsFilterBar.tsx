"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, ChevronDown, SlidersHorizontal, X } from "lucide-react";

const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "PAST_DUE", label: "Past Due" },
  { value: "CANCELED", label: "Canceled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
];

const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
];

export default function SubscriptionsFilterBar({ exportHref }: { exportHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(search);
  const status = searchParams.get("status") || "";
  const frequency = searchParams.get("frequency") || "";
  const minAmount = searchParams.get("minAmount") || "";
  const maxAmount = searchParams.get("maxAmount") || "";
  const hasFailedPayment = searchParams.get("hasFailedPayment") === "1";
  const hasPastDue = searchParams.get("hasPastDue") === "1";
  const requiresAttention = searchParams.get("requiresAttention") === "1";

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isFreqOpen, setIsFreqOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== search) setParam("search", searchInput);
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const activeFilterCount =
    [status, frequency, minAmount, maxAmount].filter(Boolean).length + (hasFailedPayment ? 1 : 0) + (hasPastDue ? 1 : 0) + (requiresAttention ? 1 : 0);

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
    setSearchInput("");
    router.push(pathname);
  };

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <input
        type="text"
        placeholder="Search subscription ID, donor, email, last four"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-72"
      />

      <div className="relative">
        <button
          onClick={() => setIsStatusOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${isStatusOpen ? "border-slate-900" : "border-slate-200"}`}
        >
          {status ? STATUSES.find((s) => s.value === status)?.label : "Status"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isStatusOpen ? "rotate-180" : ""}`} />
        </button>
        {isStatusOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStatusOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-48">
              <button onClick={() => { setParam("status", ""); setIsStatusOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Any Status
              </button>
              {STATUSES.map((s) => (
                <button key={s.value} onClick={() => { setParam("status", s.value); setIsStatusOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setIsFreqOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${isFreqOpen ? "border-slate-900" : "border-slate-200"}`}
        >
          {frequency ? FREQUENCIES.find((f) => f.value === frequency)?.label : "Frequency"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isFreqOpen ? "rotate-180" : ""}`} />
        </button>
        {isFreqOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsFreqOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-48">
              <button onClick={() => { setParam("frequency", ""); setIsFreqOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Any Frequency
              </button>
              {FREQUENCIES.map((f) => (
                <button key={f.value} onClick={() => { setParam("frequency", f.value); setIsFreqOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {f.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setIsMoreOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${isMoreOpen ? "border-slate-900" : "border-slate-200"}`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Additional Filters
        </button>
        {isMoreOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsMoreOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-80 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Min Amount ($)</label>
                  <input type="text" value={minAmount} onChange={(e) => setParam("minAmount", e.target.value)} className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Max Amount ($)</label>
                  <input type="text" value={maxAmount} onChange={(e) => setParam("maxAmount", e.target.value)} className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={hasFailedPayment} onChange={() => toggleParam("hasFailedPayment", hasFailedPayment)} />
                Has failed payment
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={hasPastDue} onChange={() => toggleParam("hasPastDue", hasPastDue)} />
                Has past-due status
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={requiresAttention} onChange={() => toggleParam("requiresAttention", requiresAttention)} />
                Requires attention
              </label>
            </div>
          </>
        )}
      </div>

      {activeFilterCount > 0 && (
        <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100">
          <X className="w-3.5 h-3.5" />
          Clear Filters
        </button>
      )}

      <div className="ml-auto">
        <a href={`${exportHref}?${searchParams.toString()}`} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Download className="w-4 h-4" />
          Export
        </a>
      </div>
    </div>
  );
}
