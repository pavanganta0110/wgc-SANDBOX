"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, X, Download } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";

const STATES = ["SUCCEEDED", "PENDING", "FAILED", "CANCELED", "REFUNDED", "PARTIALLY_REFUNDED", "RETURNED"];

function titleCase(s: string) {
  return s.replace(/_/g, " ").split(" ").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

export default function DonationAttemptsFilterBar({
  exportHref,
  showGivingLinkFilter = true,
}: {
  exportHref?: string;
  showGivingLinkFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = searchParams.get("state") || "";
  const givingLinkName = searchParams.get("linkName") || "";
  const donor = searchParams.get("donor") || "";
  const amount = searchParams.get("amount") || "";

  const [isStateOpen, setIsStateOpen] = useState(false);

  const activeFilterCount = [state, givingLinkName, donor, amount].filter(Boolean).length;

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("id");
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
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-52">
              <button onClick={() => { setParam("state", ""); setIsStateOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                All States
              </button>
              {STATES.map((s) => (
                <button key={s} onClick={() => { setParam("state", s); setIsStateOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  {titleCase(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {showGivingLinkFilter && (
        <input
          type="text"
          placeholder="Giving Link Name"
          value={givingLinkName}
          onChange={(e) => setParam("linkName", e.target.value)}
          className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-44"
        />
      )}

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
