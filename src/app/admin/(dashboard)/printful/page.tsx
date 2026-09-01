"use client";

import { useEffect, useState } from "react";

interface ConnectionRow {
  churchId: string;
  churchName: string;
  status: string;
  connectionType: string;
  storeId: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  productsSynced: number;
  totalOrders: number;
  failedOrders: number;
  webhookErrors: number;
}

export default function AdminPrintfulPage() {
  const [rows, setRows] = useState<ConnectionRow[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/printful")
      .then((res) => res.json())
      .then((data) => setRows(data.connections || []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Printful</h1>
      <p className="text-sm text-slate-500 mb-6">Per-merchant merchandise connections. Access tokens are never shown here.</p>

      {rows === null ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">No merchants have connected Printful yet.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Merchant</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Store ID</th>
                <th className="text-left px-5 py-3">Last Sync</th>
                <th className="text-left px-5 py-3">Products</th>
                <th className="text-left px-5 py-3">Orders</th>
                <th className="text-left px-5 py-3">Failed Orders</th>
                <th className="text-left px-5 py-3">Webhook Errors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.churchId} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-semibold text-slate-900">{r.churchName}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === "CONNECTED" ? "bg-green-50 text-green-700" : r.status === "ERROR" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{r.status}</span>
                    {r.connectionType === "mock" && <span className="ml-2 text-[10px] font-bold uppercase text-amber-600">Mock</span>}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-slate-500">{r.storeId || "—"}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString() : "Never"}</td>
                  <td className="px-5 py-3">{r.productsSynced}</td>
                  <td className="px-5 py-3">{r.totalOrders}</td>
                  <td className="px-5 py-3">{r.failedOrders > 0 ? <span className="text-red-600 font-bold">{r.failedOrders}</span> : 0}</td>
                  <td className="px-5 py-3">{r.webhookErrors > 0 ? <span className="text-red-600 font-bold">{r.webhookErrors}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
