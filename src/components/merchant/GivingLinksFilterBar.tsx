"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Download, ChevronDown, X } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";

const STATUSES = ["ACTIVE", "INACTIVE", "EXPIRED", "ARCHIVED"];
const LINK_TYPES = [
  { value: "ONE_TIME", label: "One-Time Link" },
  { value: "MULTI_USE", label: "Multi-Use Link" },
];
const AMOUNT_TYPES = [
  { value: "FIXED", label: "Fixed Amount" },
  { value: "VARIABLE", label: "Variable Amount" },
];

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default function GivingLinksFilterBar({ exportHref }: { exportHref?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "";
  const linkType = searchParams.get("linkType") || "";
  const amountType = searchParams.get("amountType") || "";
  const name = searchParams.get("name") || "";

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isLinkTypeOpen, setIsLinkTypeOpen] = useState(false);
  const [isAmountTypeOpen, setIsAmountTypeOpen] = useState(false);

  const activeFilterCount = [status, linkType, amountType, name].filter(Boolean).length;

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    const tab = searchParams.get("tab");
    if (tab) params.set("tab", tab);
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <DateRangePicker />

      {/* Status */}
      <div className="relative">
        <button
          onClick={() => setIsStatusOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isStatusOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {status ? titleCase(status) : "Status"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isStatusOpen ? "rotate-180" : ""}`} />
        </button>
        {isStatusOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStatusOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-44">
              <button onClick={() => { setParam("status", ""); setIsStatusOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                All Statuses
              </button>
              {STATUSES.map((s) => (
                <button key={s} onClick={() => { setParam("status", s); setIsStatusOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {titleCase(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Link Type */}
      <div className="relative">
        <button
          onClick={() => setIsLinkTypeOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isLinkTypeOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {LINK_TYPES.find((t) => t.value === linkType)?.label || "Link Type"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isLinkTypeOpen ? "rotate-180" : ""}`} />
        </button>
        {isLinkTypeOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsLinkTypeOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-48">
              <button onClick={() => { setParam("linkType", ""); setIsLinkTypeOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                All Link Types
              </button>
              {LINK_TYPES.map((t) => (
                <button key={t.value} onClick={() => { setParam("linkType", t.value); setIsLinkTypeOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Amount Type */}
      <div className="relative">
        <button
          onClick={() => setIsAmountTypeOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isAmountTypeOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {AMOUNT_TYPES.find((t) => t.value === amountType)?.label || "Amount Type"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isAmountTypeOpen ? "rotate-180" : ""}`} />
        </button>
        {isAmountTypeOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsAmountTypeOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-48">
              <button onClick={() => { setParam("amountType", ""); setIsAmountTypeOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                All Amount Types
              </button>
              {AMOUNT_TYPES.map((t) => (
                <button key={t.value} onClick={() => { setParam("amountType", t.value); setIsAmountTypeOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Link Name */}
      <input
        type="text"
        placeholder="Link Name"
        value={name}
        onChange={(e) => setParam("name", e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-44"
      />

      {activeFilterCount > 0 && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-3.5 h-3.5" />
          Clear Filters
        </button>
      )}

      {exportHref && (
        <a
          href={exportHref}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" />
          Export
        </a>
      )}
    </div>
  );
}
