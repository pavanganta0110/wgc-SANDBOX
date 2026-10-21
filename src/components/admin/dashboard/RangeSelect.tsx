"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { ADMIN_RANGES, ADMIN_RANGE_LABEL, type AdminRange } from "@/lib/admin/rangeOptions";

export default function RangeSelect({ range }: { range: AdminRange }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={`relative inline-flex items-center ${pending ? "opacity-70" : ""}`}>
      <span className="sr-only">Reporting period</span>
      <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden />
      <select
        value={range}
        onChange={(e) => {
          const r = e.target.value;
          start(() => router.push(r === "ytd" ? "/admin" : `/admin?range=${r}`));
        }}
        className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-semibold text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none"
      >
        {ADMIN_RANGES.map((r) => (
          <option key={r} value={r}>
            {ADMIN_RANGE_LABEL[r]}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" viewBox="0 0 20 20" aria-hidden>
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
