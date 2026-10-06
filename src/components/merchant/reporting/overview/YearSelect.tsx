"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarDays } from "lucide-react";

export default function YearSelect({
  year,
  options,
  currentYear,
}: {
  year: number;
  options: number[];
  currentYear: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label
      className={`relative inline-flex items-center ${pending ? "opacity-70" : ""}`}
    >
      <span className="sr-only">Reporting year</span>
      <CalendarDays
        className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400"
        aria-hidden
      />
      <select
        value={year}
        onChange={(e) => {
          const y = Number(e.target.value);
          start(() =>
            router.push(
              y === currentYear
                ? "/merchant/reporting"
                : `/merchant/reporting?year=${y}`,
            ),
          );
        }}
        className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-semibold text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none"
      >
        {options.map((y) => (
          <option key={y} value={y}>
            {y === currentYear ? `${y} (year to date)` : y}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          d="M5.5 7.5 10 12l4.5-4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </label>
  );
}
