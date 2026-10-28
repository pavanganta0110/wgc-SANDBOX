"use client";

import { Download } from "lucide-react";

/**
 * Downloads the Students list exactly as filtered on screen. Plain links to
 * the export route (a GET with the current term + filter), so there is no
 * client state to get out of sync with what the user is looking at.
 */
export default function DownloadMenu({ term, filterKey, filterLabel, count }: { term: string; filterKey: string; filterLabel: string; count: number }) {
  const q = (extra: string) => `/api/merchant/students/export?term=${encodeURIComponent(term)}&filter=${filterKey}&${extra}`;
  const item = "block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50";
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <Download className="h-4 w-4" aria-hidden /> Download
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
        <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
          {filterLabel} · {count} {count === 1 ? "student" : "students"} · {term}
        </p>
        <a className={item} href={q("type=ledger&format=csv")}>Student list (CSV)</a>
        <a className={item} href={q("type=ledger&format=pdf")}>Student list (PDF)</a>
        <a className={item} href={q("type=gifts&format=csv")}>Every gift for these students (CSV)</a>
      </div>
    </details>
  );
}
