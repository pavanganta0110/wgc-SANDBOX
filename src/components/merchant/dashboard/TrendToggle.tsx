"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** Segmented daily/weekly/monthly control; same `trend` query param as the
 * old dropdown, so links and the Insights page keep working. */
export default function TrendToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = searchParams.get("trend") || "weekly";

  const select = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trend", value);
    startTransition(() => router.push(`?${params.toString()}`, { scroll: false }));
  };

  return (
    <div
      role="group"
      aria-label="Trend granularity"
      className={`inline-flex rounded-xl bg-slate-100 p-0.5 text-sm transition-opacity ${pending ? "opacity-60" : ""}`}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          onClick={() => select(o.value)}
          className={`rounded-[10px] px-3 py-1.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            current === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
