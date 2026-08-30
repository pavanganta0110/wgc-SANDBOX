"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

/**
 * Starts a "View as Merchant" impersonation session and navigates into the
 * real merchant dashboard. Uses a full page navigation (not the Next.js
 * client router) since this crosses from /admin to /merchant and the very
 * next request needs the freshly-set wgc_impersonation cookie to be
 * present — a client-side route transition wouldn't guarantee a full
 * request round-trip the same way.
 */
export default function OpenMerchantDashboardButton({ churchId }: { churchId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/impersonate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to open merchant dashboard.");
        setLoading(false);
        return;
      }
      window.location.href = data.redirectTo || "/merchant/dashboard";
    } catch {
      setError("Failed to open merchant dashboard.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-60"
      >
        <Eye className="w-4 h-4" />
        {loading ? "Opening…" : "Open Merchant Dashboard"}
      </button>
      <span className="text-[11px] text-gray-400">View the platform exactly as this merchant sees it</span>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
