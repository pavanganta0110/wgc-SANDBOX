"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Loader2, PackageCheck, Truck, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { formatCents } from "@/lib/format";

const SIMULATE_STEPS: { key: string; label: string }[] = [
  { key: "IN_FULFILLMENT", label: "Mark In Fulfillment" },
  { key: "SHIPPED", label: "Mark Shipped" },
  { key: "DELIVERED", label: "Mark Delivered" },
  { key: "FAILED", label: "Simulate Failure" },
  { key: "CANCELLED", label: "Simulate Cancellation" },
];

export default function MerchandiseOrderDetail({ orderId }: { orderId: string }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/merchant/merchandise/orders/${orderId}`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ error: true }));
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const retry = async () => {
    setBusy("retry");
    try {
      const res = await fetch(`/api/merchant/merchandise/orders/${orderId}/retry`, { method: "POST" });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Retry failed.");
      toast.success("Order resubmitted to Printful.");
      load();
    } catch (err: any) {
      toast.error(err.message || "Retry failed.");
    } finally {
      setBusy(null);
    }
  };

  const simulate = async (nextStatus: string) => {
    setBusy(nextStatus);
    try {
      const res = await fetch(`/api/merchant/merchandise/orders/${orderId}/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nextStatus }) });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Could not simulate this event.");
      toast.success(`Simulated: ${nextStatus.replace(/_/g, " ")}`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Simulation failed.");
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading…</div>;
  if (data.error || !data.order) return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Order not found.</div>;

  const { order, donor, finixTransfer } = data;
  const canRetry = order.status === "FULFILLMENT_PENDING" || order.status === "FAILED";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs text-slate-500 font-mono">{order.wgcOrderNumber}</p>
            <h2 className="text-lg font-bold text-slate-900">{order.status.replace(/_/g, " ")}</h2>
          </div>
          {canRetry && (
            <button onClick={retry} disabled={busy !== null} className="px-4 py-2 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm">
              {busy === "retry" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Retry Fulfillment Submission
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Customer</h3>
            <p className="text-sm text-slate-900 font-semibold">{donor?.name || "—"}</p>
            <p className="text-sm text-slate-500">{order.customerEmail}</p>
            <p className="text-sm text-slate-500">{order.customerPhone}</p>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Shipping</h3>
            <p className="text-sm text-slate-900">{order.shipping.name}</p>
            <p className="text-sm text-slate-500">{order.shipping.address1} {order.shipping.address2}</p>
            <p className="text-sm text-slate-500">{order.shipping.city}, {order.shipping.state} {order.shipping.postalCode}</p>
            <p className="text-sm text-slate-500">{order.shipping.country}</p>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Fulfillment</h3>
            <p className="text-sm text-slate-900">Provider: {order.fulfillment.provider}</p>
            <p className="text-sm text-slate-500 font-mono text-xs">{order.fulfillment.externalOrderId || "Not submitted yet"}</p>
            {order.fulfillment.trackingNumber && (
              <p className="text-sm text-slate-500">
                {order.fulfillment.carrier}: {order.fulfillment.trackingUrl ? <a href={order.fulfillment.trackingUrl} target="_blank" className="text-blue-600 hover:underline">{order.fulfillment.trackingNumber}</a> : order.fulfillment.trackingNumber}
              </p>
            )}
            {order.fulfillment.failureReason && <p className="text-sm text-red-600">{order.fulfillment.failureReason}</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Items</h3>
        <div className="space-y-3">
          {order.items.map((i: any) => (
            <div key={i.id} className="flex items-center gap-4">
              {i.imageUrl && <img src={i.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />}
              <div className="flex-grow">
                <p className="text-sm font-semibold text-slate-900">{i.productName}</p>
                <p className="text-xs text-slate-500">{i.variantName} × {i.quantity}</p>
              </div>
              <p className="text-sm font-semibold">{formatCents(i.lineTotal)}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 mt-4 pt-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatCents(order.amounts.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Shipping</span><span>{formatCents(order.amounts.shipping)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{formatCents(order.amounts.tax)}</span></div>
          <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-100"><span>Total (merchandise)</span><span>{formatCents(order.amounts.total)}</span></div>
          {finixTransfer && <p className="text-xs text-slate-400 pt-2">Finix transfer: {finixTransfer.finixTransferId}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <PackageCheck className="w-4 h-4 text-amber-700" />
          <h3 className="text-sm font-bold text-amber-900">Mock Webhook Simulator (Sandbox Only)</h3>
        </div>
        <p className="text-xs text-amber-800 mb-4">Simulate Printful fulfillment lifecycle events to test the full order pipeline without real credentials.</p>
        <div className="flex flex-wrap gap-2">
          {SIMULATE_STEPS.map((s) => (
            <button key={s.key} onClick={() => simulate(s.key)} disabled={busy !== null || !order.fulfillment.externalOrderId} className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1.5">
              {busy === s.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : s.key === "SHIPPED" ? <Truck className="w-3.5 h-3.5" /> : s.key === "DELIVERED" ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.key === "FAILED" || s.key === "CANCELLED" ? <XCircle className="w-3.5 h-3.5" /> : null}
              {s.label}
            </button>
          ))}
        </div>
        {!order.fulfillment.externalOrderId && <p className="text-xs text-amber-700 mt-2">Submit this order to the provider first (or retry) before simulating events.</p>}
      </div>
    </div>
  );
}
