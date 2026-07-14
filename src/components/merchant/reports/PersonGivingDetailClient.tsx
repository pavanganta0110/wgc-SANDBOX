"use client";

import { useState } from "react";
import { formatCents } from "@/lib/format";
import { Download, Search } from "lucide-react";
import Link from "next/link";

export default function PersonGivingDetailClient({ person, payments }: { person: any; payments: any[] }) {
  const [search, setSearch] = useState("");

  const filtered = payments.filter((pay) => {
    const term = search.toLowerCase();
    const donorName = (pay.donor?.name || "").toLowerCase();
    const donorEmail = (pay.donor?.email || "").toLowerCase();
    const pageName = (pay.givingPage?.name || "").toLowerCase();
    return donorName.includes(term) || donorEmail.includes(term) || pageName.includes(term);
  });

  const totalAmount = payments.reduce((sum, pay) => sum + (pay.donationAmountCents || pay.amountCents), 0);
  const uniqueDonors = new Set(payments.filter(p => p.donorId).map(p => p.donorId)).size;

  const downloadCsv = () => {
    const headers = ["Date", "Donor Name", "Donor Email", "Amount", "Giving Page", "Payment Method", "Status"];
    const rows = filtered.map((pay) => [
      new Date(pay.createdAt).toLocaleDateString(),
      pay.donor?.name || "Anonymous",
      pay.donor?.email || "",
      ( (pay.donationAmountCents || pay.amountCents) / 100).toFixed(2),
      pay.givingPage?.name || "",
      pay.paymentMethodType,
      pay.status,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `donations_${person.displayName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Designated</p>
          <p className="text-3xl font-bold text-slate-900">{formatCents(totalAmount)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Donations</p>
          <p className="text-3xl font-bold text-slate-900">{payments.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Unique Donors</p>
          <p className="text-3xl font-bold text-slate-900">{uniqueDonors}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search donor or page..."
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
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Donor</th>
                <th className="px-5 py-3 font-semibold">Giving Page</th>
                <th className="px-5 py-3 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((pay) => (
                <tr key={pay.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3 text-slate-600">
                    {new Date(pay.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{pay.donor?.name || "Anonymous"}</p>
                    <p className="text-xs text-slate-500">{pay.donor?.email}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{pay.givingPage?.name}</td>
                  <td className="px-5 py-3 text-right text-slate-900 font-medium">
                    {formatCents(pay.donationAmountCents || pay.amountCents)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                    No transactions found
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
