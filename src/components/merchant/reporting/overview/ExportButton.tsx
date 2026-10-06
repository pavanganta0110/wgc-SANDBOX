"use client";

import { Download } from "lucide-react";
import type { ReportingOverviewModel } from "./types";

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads what's on screen (monthly giving, payment methods, funds) as one CSV. No server round trip. */
export default function ExportButton({
  model,
}: {
  model: ReportingOverviewModel;
}) {
  function download() {
    const dollars = (c: number) => (c / 100).toFixed(2);
    const lines: (string | number)[][] = [
      [`Giving overview — ${model.periodLabel}`],
      [],
      ["Monthly giving"],
      ["Month", "Gross", "Net", "Gifts", "Donors"],
      ...model.trend.map((t) => [
        t.period,
        dollars(t.grossDonatedCents),
        dollars(t.netDonatedCents),
        t.donationCount,
        t.uniqueDonorCount,
      ]),
      [],
      ["Payment methods"],
      ["Method", "Amount", "Payments", "Share %"],
      ...model.methodMix.map((m) => [
        m.label,
        dollars(m.valueCents),
        m.count,
        m.sharePercent.toFixed(1),
      ]),
      [],
      ["Giving by fund"],
      ["Fund", "Amount", "Share %"],
      ...model.funds.map((f) => [
        f.label,
        dollars(f.valueCents),
        f.sharePercent.toFixed(1),
      ]),
    ];
    const csv = lines.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `giving-overview-${model.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none"
    >
      <Download className="h-4 w-4" aria-hidden />
      Export
    </button>
  );
}
