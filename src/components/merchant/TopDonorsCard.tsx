"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Repeat, AlertTriangle } from "lucide-react";
import type { TopDonorMetric, TopDonorRow } from "@/lib/donors/donorAnalytics";
import { formatCents } from "@/lib/format";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";

const METRICS: { key: TopDonorMetric; label: string }[] = [
  { key: "gross", label: "Gross Donated" },
  { key: "net", label: "Net Donated" },
  { key: "count", label: "Donation Count" },
  { key: "recurring", label: "Recurring Value" },
];

function initials(name: string) {
  const words = name.split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default function TopDonorsCard({ rows, metric }: { rows: TopDonorRow[]; metric: TopDonorMetric }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setMetric = (m: TopDonorMetric) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("topMetric", m);
    router.push(`?${params.toString()}`);
  };

  const openDonor = (donorId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", donorId);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">Top Donors</h3>
      </div>
      <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1 mb-3 flex-wrap">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-2 py-1 rounded-md text-xs font-semibold ${
              metric === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">
          Top donors will appear after successful donations are received.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <button
              key={r.donorId}
              onClick={() => openDonor(r.donorId)}
              className="w-full flex items-center gap-3 text-left hover:bg-slate-50 rounded-xl p-2 -m-2"
            >
              <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                {initials(r.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-900 truncate">{r.name}</p>
                  {r.isRecurring && <Repeat className="w-3 h-3 text-blue-500 shrink-0" />}
                  {r.isAtRisk && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                </div>
                <p className="text-xs text-slate-500">
                  {metric === "count" ? `${r.metricValueCents} donations` : formatCents(r.metricValueCents)}
                  {metric !== "count" && ` · ${r.donationCount} donation${r.donationCount === 1 ? "" : "s"}`}
                </p>
                <p className="text-xs text-slate-400">
                  {(r.shareOfTotal * 100).toFixed(1)}% of total
                  {r.lastDonationAt && ` · Last: ${formatDateCDT(r.lastDonationAt)}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
