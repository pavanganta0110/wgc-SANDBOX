"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TREND_OPTIONS = [
  { value: "daily", label: "Daily Trend" },
  { value: "weekly", label: "Weekly Trend" },
  { value: "monthly", label: "Monthly Trend" },
];

export default function TrendFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("trend") || "weekly";

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trend", value);
    router.push(`?${params.toString()}`);
  };

  return (
    <select
      value={current}
      onChange={(e) => handleChange(e.target.value)}
      className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-[#eab308]"
    >
      {TREND_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
