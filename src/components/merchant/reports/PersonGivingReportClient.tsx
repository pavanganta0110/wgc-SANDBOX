"use client";

import { useMemo, useState } from "react";
import { formatCents } from "@/lib/format";
import { Download, Search } from "lucide-react";
import Link from "next/link";

export default function PersonGivingReportClient({ people, payments }: { people: any[]; payments: any[] }) {
  const [search, setSearch] = useState("");

  const summary = useMemo(() => {
    const personMap = new Map();
    for (const p of people) {
      personMap.set(p.id, {
        person: p,
        totalCents: 0,
        donationCount: 0,
        uniqueDonors: new Set(),
      });
    }

    for (const pay of payments) {
      if (pay.selectedPersonId) {
        if (!personMap.has(pay.selectedPersonId)) {
          personMap.set(pay.selectedPersonId, {
            person: { id: pay.selectedPersonId, displayName: pay.selectedPersonNameSnapshot || "Unknown" },
            totalCents: 0,
            donationCount: 0,
            uniqueDonors: new Set(),
          });
        }
        const s = personMap.get(pay.selectedPersonId);
        s.totalCents += pay.donationAmountCents || pay.amountCents;
        s.donationCount++;
        if (pay.donorId) s.uniqueDonors.add(pay.donorId);
      }
    }

    return Array.from(personMap.values())
      .filter((s) => s.donationCount > 0 || s.person.isActive)
      .map((s) => ({
        ...s,
        uniqueDonorCount: s.uniqueDonors.size,
      }))
      .sort((a, b) => b.totalCents - a.totalCents || a.person.displayName.localeCompare(b.person.displayName));
  }, [people, payments]);

  const filtered = summary.filter((s) =>
    s.person.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = summary.reduce((sum, s) => sum + s.totalCents, 0);

  const downloadCsv = () => {
    const headers = ["Person", "Status", "Total Amount", "Donations", "Unique Donors"];
    const rows = filtered.map((s) => [
      s.person.displayName,
      s.person.isActive ? "Active" : "Inactive",
      (s.totalCents / 100).toFixed(2),
      s.donationCount,
      s.uniqueDonorCount,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `person_giving_report.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Person Giving</p>
          <p className="text-3xl font-bold text-slate-900">{formatCents(totalAmount)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Active Designations</p>
          <p className="text-3xl font-bold text-slate-900">{people.filter((p) => p.isActive).length}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#eab308] w-64"
            />
          </div>
          <button
            onClick={downloadCsv}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">Person</th>
                <th className="px-5 py-3 font-semibold text-right">Total Amount</th>
                <th className="px-5 py-3 font-semibold text-right">Donations</th>
                <th className="px-5 py-3 font-semibold text-right">Unique Donors</th>
                <th className="px-5 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.person.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{s.person.displayName}</span>
                      {s.person.isActive === false && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                          Inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-900 font-medium">
                    {formatCents(s.totalCents)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600">{s.donationCount}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{s.uniqueDonorCount}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/merchant/reports/person-giving/${s.person.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    No results found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
