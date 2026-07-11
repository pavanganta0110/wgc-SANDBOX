"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Download, ChevronDown, SlidersHorizontal, X, Columns3 } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import { DISPUTE_COLUMNS, parseVisibleDisputeColumns, type DisputeColumnKey } from "@/lib/disputeColumns";
import { DISPUTE_DISPLAY_STATUS_LABELS, type DisputeDisplayStatus } from "@/lib/finix/disputeStatus";

const STATUSES = Object.keys(DISPUTE_DISPLAY_STATUS_LABELS) as DisputeDisplayStatus[];
const RESPONSE_STATUSES = [
  { value: "not_submitted", label: "Not Submitted" },
  { value: "submitted", label: "Submitted" },
];
const PAYMENT_METHODS = [
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
];

export default function DisputesFilterBar({ exportHref }: { exportHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") || "";
  const responseStatus = searchParams.get("responseStatus") || "";
  const reason = searchParams.get("reason") || "";
  const amount = searchParams.get("amount") || "";
  const donor = searchParams.get("donor") || "";
  const paymentMethod = searchParams.get("paymentMethod") || "";
  const overdue = searchParams.get("overdue") === "1";
  const settlement = searchParams.get("settlement") || "";
  const deposit = searchParams.get("deposit") || "";
  const visibleCols = parseVisibleDisputeColumns(searchParams.get("cols") || undefined);

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isColsOpen, setIsColsOpen] = useState(false);

  const activeFilterCount = [status, responseStatus, reason, amount, donor, paymentMethod, settlement, deposit].filter(Boolean).length + (overdue ? 1 : 0);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("id");
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    for (const keep of ["tab", "cols"]) {
      const v = searchParams.get(keep);
      if (v) params.set(keep, v);
    }
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const toggleColumn = (key: DisputeColumnKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === DISPUTE_COLUMNS.length) params.delete("cols");
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
          {status ? DISPUTE_DISPLAY_STATUS_LABELS[status as DisputeDisplayStatus] : "Status"}
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
                  {DISPUTE_DISPLAY_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <input
        type="text"
        placeholder="Donor Name"
        value={donor}
        onChange={(e) => setParam("donor", e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-40"
      />

      <input
        type="text"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setParam("amount", e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-28"
      />

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
                <label className="block text-xs font-semibold text-slate-500 mb-1">Response Status</label>
                <select
                  value={responseStatus}
                  onChange={(e) => setParam("responseStatus", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                >
                  <option value="">Any</option>
                  {RESPONSE_STATUSES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setParam("reason", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setParam("paymentMethod", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                >
                  <option value="">Any</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={overdue} onChange={(e) => setParam("overdue", e.target.checked ? "1" : "")} />
                Evidence overdue only
              </label>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Settlement ID</label>
                <input
                  type="text"
                  value={settlement}
                  onChange={(e) => setParam("settlement", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Deposit ID</label>
                <input
                  type="text"
                  value={deposit}
                  onChange={(e) => setParam("deposit", e.target.value)}
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
              <div className="absolute right-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-56">
                {DISPUTE_COLUMNS.map((c) => (
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
