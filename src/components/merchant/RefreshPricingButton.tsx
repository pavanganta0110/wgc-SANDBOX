"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  onRefreshed?: () => void;
}

export default function RefreshPricingButton({ onRefreshed }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/merchant/subscription/sync-pricing", { method: "POST" });
      if (res.ok) {
        setResult("ok");
        // Reload to show the fresh ChurchPricing values from the server
        window.location.reload();
        onRefreshed?.();
      } else {
        setResult("error");
      }
    } catch {
      setResult("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Refreshing…" : "Refresh Rates"}
      </button>
      {result === "error" && (
        <p className="text-xs text-red-500">Refresh failed. Try again shortly.</p>
      )}
    </div>
  );
}
