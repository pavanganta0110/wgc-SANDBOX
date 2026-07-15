"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { PAYMENT_DIMENSIONS } from "@/lib/reports/insightsData";

export default function DimensionFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("dim") || "cardBrand";

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("dim", value);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="relative">
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        className="appearance-none px-4 py-2 pr-9 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-[#eab308]"
      >
        {PAYMENT_DIMENSIONS.map((dim) => (
          <option key={dim.key} value={dim.key}>
            {dim.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}
