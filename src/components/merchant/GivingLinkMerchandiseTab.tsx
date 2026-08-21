"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Loader2, GripVertical, Star, ExternalLink } from "lucide-react";

interface AvailableProduct {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  variantCount: number;
}

interface Assignment {
  productId: string;
  enabled: boolean;
  displayOrder: number;
  featured: boolean;
  customTitle: string | null;
  customDescription: string | null;
  priceOverride: number | null;
}

/**
 * Giving Page Builder -> Merchandise (spec item 28). Purely additive — a
 * giving link with merchandiseEnabled=false (the default for every
 * existing and new link) is completely unaffected by this component
 * existing; nothing here runs until a merchant opens this tab.
 */
export default function GivingLinkMerchandiseTab({ givingLinkId, publicSlug }: { givingLinkId: string; publicSlug: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [merchandiseEnabled, setMerchandiseEnabled] = useState(false);
  const [available, setAvailable] = useState<AvailableProduct[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/merchant/merchandise/giving-pages/${givingLinkId}`)
      .then((res) => res.json())
      .then((data) => {
        setMerchandiseEnabled(Boolean(data.merchandiseEnabled));
        setAvailable(data.availableProducts || []);
        const map: Record<string, Assignment> = {};
        for (const a of data.assignments || []) {
          map[a.productId] = { productId: a.productId, enabled: a.enabled, displayOrder: a.displayOrder, featured: a.featured, customTitle: a.customTitle, customDescription: a.customDescription, priceOverride: a.priceOverride };
        }
        setAssignments(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [givingLinkId]);

  useEffect(() => { load(); }, [load]);

  const toggleProduct = (productId: string, checked: boolean) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (checked) {
        next[productId] = prev[productId] || { productId, enabled: true, displayOrder: Object.keys(prev).length, featured: false, customTitle: null, customDescription: null, priceOverride: null };
      } else {
        delete next[productId];
      }
      return next;
    });
  };

  const updateAssignment = (productId: string, patch: Partial<Assignment>) => {
    setAssignments((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/merchandise/giving-pages/${givingLinkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchandiseEnabled, items: Object.values(assignments) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save.");
      toast.success("Merchandise settings saved.");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={merchandiseEnabled} onChange={(e) => setMerchandiseEnabled(e.target.checked)} className="w-5 h-5 text-blue-600 rounded" />
            <span className="font-bold text-slate-900">Enable Merchandise on this giving page</span>
          </label>
          <p className="text-sm text-slate-500 mt-1.5 ml-8 max-w-lg">
            This is the same public link as your donation page — turning this on replaces its checkout with a combined
            donate-and-shop experience for every visitor. It never creates a second, separate page.
          </p>
        </div>
        {merchandiseEnabled && (
          <a
            href={`/g/${publicSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            <ExternalLink className="w-4 h-4" /> Preview
          </a>
        )}
      </div>

      {merchandiseEnabled && (
        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Select Products</h3>
          {available.length === 0 ? (
            <p className="text-sm text-slate-500">
              No products available yet. Go to{" "}
              <a href="/merchant/merchandise" className="text-blue-600 hover:underline">
                Merchandise → Products
              </a>{" "}
              to sync and enable products first.
            </p>
          ) : (
            <div className="space-y-3">
              {available.map((p) => {
                const a = assignments[p.id];
                const checked = Boolean(a);
                return (
                  <div key={p.id} className={`border rounded-xl p-4 ${checked ? "border-blue-200 bg-blue-50/30" : "border-slate-200"}`}>
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                      <input type="checkbox" checked={checked} onChange={(e) => toggleProduct(p.id, e.target.checked)} className="w-4 h-4 text-blue-600 rounded shrink-0" />
                      {p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                      <div className="flex-grow min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.variantCount} variant{p.variantCount === 1 ? "" : "s"}</p>
                      </div>
                      {checked && (
                        <button type="button" onClick={() => updateAssignment(p.id, { featured: !a.featured })} className={`shrink-0 p-1.5 rounded-lg ${a.featured ? "text-amber-500" : "text-slate-300 hover:text-slate-400"}`} title="Feature this product">
                          <Star className="w-4 h-4" fill={a.featured ? "currentColor" : "none"} />
                        </button>
                      )}
                    </div>
                    {checked && (
                      <div className="grid sm:grid-cols-2 gap-3 mt-3 ml-11">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Custom title (optional)</label>
                          <input value={a.customTitle || ""} onChange={(e) => updateAssignment(p.id, { customTitle: e.target.value || null })} placeholder={p.name} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Price override (optional, $)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={a.priceOverride != null ? (a.priceOverride / 100).toString() : ""}
                            onChange={(e) => updateAssignment(p.id, { priceOverride: e.target.value ? Math.round(Number(e.target.value) * 100) : null })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button onClick={save} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </button>
      </div>
    </div>
  );
}
