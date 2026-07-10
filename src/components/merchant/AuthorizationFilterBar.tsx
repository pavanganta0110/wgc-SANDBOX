"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Download, ChevronDown, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import toast from "react-hot-toast";

function titleCase(s: string) {
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export default function AuthorizationFilterBar({
  states,
  exportHref,
  syncHref,
}: {
  states: string[];
  exportHref?: string;
  syncHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = searchParams.get("state") || "";
  const buyer = searchParams.get("buyer") || "";
  const last4 = searchParams.get("last4") || "";
  const org = searchParams.get("org") || "";
  const captured = searchParams.get("captured") || "";

  const [isStateOpen, setIsStateOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const activeFilterCount = [state, buyer, last4, org, captured].filter(Boolean).length;

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("id");
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const stateLabel = state ? titleCase(state) : "State";

  const handleSync = async () => {
    if (!syncHref || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(syncHref, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Sync failed");
      } else {
        toast.success(`Synced: ${data.created} added, ${data.updated} updated`);
        router.refresh();
      }
    } catch {
      toast.error("Sync failed — please try again");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <DateRangePicker />

      {/* State filter */}
      <div className="relative">
        <button
          onClick={() => setIsStateOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isStateOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {stateLabel}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${isStateOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isStateOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStateOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-44">
              <button
                onClick={() => { setParam("state", ""); setIsStateOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                All States
              </button>
              {states.map((s) => (
                <button
                  key={s}
                  onClick={() => { setParam("state", s); setIsStateOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {titleCase(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Last Four */}
      <input
        type="text"
        placeholder="Last Four"
        value={last4}
        maxLength={4}
        onChange={(e) => setParam("last4", e.target.value.replace(/\D/g, ""))}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-28"
      />

      {/* Donor Name */}
      <input
        type="text"
        placeholder="Donor Name"
        value={buyer}
        onChange={(e) => setParam("buyer", e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-40"
      />

      {/* Additional filters (Organization/Church name, Captured status) */}
      <div className="relative">
        <button
          onClick={() => setIsMoreOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isMoreOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Additional Filters
        </button>
        {isMoreOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsMoreOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-64 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Organization / Church Name
                </label>
                <input
                  type="text"
                  placeholder="Organization name"
                  value={org}
                  onChange={(e) => setParam("org", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Captured Status</label>
                <select
                  value={captured}
                  onChange={(e) => setParam("captured", e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none"
                >
                  <option value="">Any</option>
                  <option value="true">Captured</option>
                  <option value="false">Not Captured</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Clear filters */}
      {activeFilterCount > 0 && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-3.5 h-3.5" />
          Clear Filters
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {syncHref && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Authorizations"}
          </button>
        )}

        {exportHref && (
          <a
            href={`${exportHref}?${searchParams.toString()}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Export
          </a>
        )}
      </div>
    </div>
  );
}
