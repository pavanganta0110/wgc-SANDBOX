"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatCents } from "@/lib/format";

interface Variant {
  id: string;
  name: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  imageUrl: string | null;
  providerCost: number;
  merchantPrice: number;
  available: boolean;
  stockStatus: string;
  active: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  primaryImageUrl: string | null;
  active: boolean;
  visibleOnGivingPage: boolean;
  syncStatus: string;
  lastSyncedAt: string | null;
  variantCount: number;
  variants: Variant[];
}

export default function MerchandiseProductsList() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/merchant/merchandise/products")
      .then((res) => res.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateProduct = async (id: string, patch: Record<string, unknown>) => {
    setProducts((prev) => prev?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? prev);
    try {
      const res = await fetch(`/api/merchant/merchandise/products/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to save — reloading.");
      load();
    }
  };

  const updateVariantPrice = async (productId: string, variantId: string, priceDollars: string) => {
    const cents = Math.round(Number(priceDollars) * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    setProducts((prev) => prev?.map((p) => (p.id === productId ? { ...p, variants: p.variants.map((v) => (v.id === variantId ? { ...v, merchantPrice: cents } : v)) } : p)) ?? prev);
    await fetch(`/api/merchant/merchandise/products/${productId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variants: [{ id: variantId, merchantPrice: cents }] }) });
  };

  const updateVariantActive = async (productId: string, variantId: string, active: boolean) => {
    setProducts((prev) => prev?.map((p) => (p.id === productId ? { ...p, variants: p.variants.map((v) => (v.id === variantId ? { ...v, active } : v)) } : p)) ?? prev);
    await fetch(`/api/merchant/merchandise/products/${productId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variants: [{ id: variantId, active }] }) });
  };

  if (products === null) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading…</div>;
  }
  if (products.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">
        No products synced yet. Connect Printful and run a sync from the Integrations page.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {products.map((p) => (
        <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-4 p-5">
            {p.thumbnailUrl || p.primaryImageUrl ? (
              <img src={p.thumbnailUrl || p.primaryImageUrl || undefined} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0 bg-slate-100" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0" />
            )}
            <div className="flex-grow min-w-0">
              <p className="font-bold text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-500">
                {p.variantCount} variant{p.variantCount === 1 ? "" : "s"} · Sync: {p.syncStatus}
                {p.lastSyncedAt ? ` · Last synced ${new Date(p.lastSyncedAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 shrink-0">
              <input type="checkbox" checked={p.active} onChange={(e) => updateProduct(p.id, { active: e.target.checked })} className="w-4 h-4 text-blue-600 rounded" />
              Active
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 shrink-0">
              <input type="checkbox" checked={p.visibleOnGivingPage} onChange={(e) => updateProduct(p.id, { visibleOnGivingPage: e.target.checked })} className="w-4 h-4 text-blue-600 rounded" />
              Available for giving pages
            </label>
            <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="p-2 rounded-lg hover:bg-slate-50 shrink-0">
              {expanded === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {expanded === p.id && (
            <div className="border-t border-slate-100 bg-slate-50/50 p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="pb-2">Variant</th>
                    <th className="pb-2">SKU</th>
                    <th className="pb-2">Provider Cost</th>
                    <th className="pb-2">WGC Price</th>
                    <th className="pb-2">Availability</th>
                    <th className="pb-2">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {p.variants.map((v) => (
                    <tr key={v.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          {v.imageUrl && <img src={v.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 bg-slate-100" />}
                          <span>
                            {v.name}
                            {v.size || v.color ? <span className="text-slate-400"> ({[v.size, v.color].filter(Boolean).join(" / ")})</span> : null}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-slate-500 font-mono text-xs">{v.sku}</td>
                      <td className="py-2 pr-4 text-slate-500">{formatCents(v.providerCost)}</td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={(v.merchantPrice / 100).toFixed(2)}
                          onBlur={(e) => updateVariantPrice(p.id, v.id, e.target.value)}
                          className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-sm outline-none"
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            v.stockStatus === "IN_STOCK" ? "bg-green-50 text-green-700" : v.stockStatus === "LOW_STOCK" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                          }`}
                        >
                          {v.stockStatus.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2">
                        <input type="checkbox" checked={v.active} onChange={(e) => updateVariantActive(p.id, v.id, e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
