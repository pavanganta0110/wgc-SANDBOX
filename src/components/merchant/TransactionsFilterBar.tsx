"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function TransactionsFilterBar({
  states,
  exportHref,
}: {
  states: string[];
  exportHref?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get("state") || "";
  const [isStateOpen, setIsStateOpen] = useState(false);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  const stateLabel = state ? titleCase(state) : "State";

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
          {stateLabel}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${isStateOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isStateOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStateOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-44">
              <button
                onClick={() => {
                  setParam("state", "");
                  setIsStateOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                All States
              </button>
              {states.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setParam("state", s);
                    setIsStateOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {titleCase(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {exportHref && (
        <a
          href={`${exportHref}?${searchParams.toString()}`}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" />
          Export
        </a>
      )}
    </div>
  );
}
