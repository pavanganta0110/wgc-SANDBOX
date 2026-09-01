"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/format";

interface OrderRow {
  id: string;
  wgcOrderNumber: string;
  donor: { name: string | null; email: string | null } | null;
  customerEmail: string | null;
  itemCount: number;
  merchandiseAmount: number;
  status: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  trackingNumber: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-blue-50 text-blue-700",
  FULFILLMENT_PENDING: "bg-amber-50 text-amber-700",
  SUBMITTED: "bg-blue-50 text-blue-700",
  IN_FULFILLMENT: "bg-blue-50 text-blue-700",
  SHIPPED: "bg-indigo-50 text-indigo-700",
  DELIVERED: "bg-green-50 text-green-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  FAILED: "bg-red-50 text-red-700",
};

export default function MerchandiseOrdersList() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    fetch("/api/merchant/merchandise/orders")
      .then((res) => res.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => setOrders([]));
  }, []);

  if (orders === null) return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading…</div>;
  if (orders.length === 0) return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">No merchandise orders yet.</div>;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[800px]">
        <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="text-left px-5 py-3">Order #</th>
            <th className="text-left px-5 py-3">Customer</th>
            <th className="text-left px-5 py-3">Items</th>
            <th className="text-left px-5 py-3">Merch. Amount</th>
            <th className="text-left px-5 py-3">Status</th>
            <th className="text-left px-5 py-3">Tracking</th>
            <th className="text-left px-5 py-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50/50">
              <td className="px-5 py-3">
                <Link href={`/merchant/merchandise/orders/${o.id}`} className="font-mono text-xs font-bold text-blue-600 hover:underline">
                  {o.wgcOrderNumber}
                </Link>
              </td>
              <td className="px-5 py-3">{o.donor?.name || o.customerEmail || "—"}</td>
              <td className="px-5 py-3">{o.itemCount}</td>
              <td className="px-5 py-3 font-semibold">{formatCents(o.merchandiseAmount)}</td>
              <td className="px-5 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[o.status] || "bg-slate-100 text-slate-600"}`}>{o.status.replace(/_/g, " ")}</span>
              </td>
              <td className="px-5 py-3 text-xs text-slate-500">{o.trackingNumber || "—"}</td>
              <td className="px-5 py-3 text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
