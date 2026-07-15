"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";

export interface DisputeRow {
  brand: string;
  count: number;
  volume: string;
  volumeCents: number;
}

type SortKey = "brand" | "count" | "volumeCents";

export default function CardDisputeDataTable({
  rows,
  dimensionLabel,
}: {
  rows: DisputeRow[];
  dimensionLabel: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("volumeCents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    const cmp = typeof aVal === "string" ? aVal.localeCompare(String(bVal)) : Number(aVal) - Number(bVal);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const columns: { key: SortKey; label: string }[] = [
    { key: "brand", label: dimensionLabel },
    { key: "count", label: "Dispute Count" },
    { key: "volumeCents", label: "Disputed Volume" },
  ];

  if (rows.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-slate-400">No results returned</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-semibold text-slate-500 uppercase bg-slate-50">
          {columns.map((col) => (
            <th key={col.key} className="px-6 py-3">
              <button
                onClick={() => handleSort(col.key)}
                className="flex items-center gap-1 hover:text-slate-700"
              >
                {col.label}
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.brand} className="border-t border-slate-50">
            <td className="px-6 py-3 font-medium text-slate-900">{row.brand}</td>
            <td className="px-6 py-3">{row.count}</td>
            <td className="px-6 py-3">{row.volume}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
