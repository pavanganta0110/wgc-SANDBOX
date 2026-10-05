"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * Fetches this merchant's live state directly from Finix and applies
 * termination handling if Finix reports the account terminated — the
 * manual backfill for any Church whose terminating webhook fired before
 * handleMerchantTermination.ts existed (Finix won't resend that webhook
 * on its own).
 */
export default function ResyncFinixTerminationButton({ churchId }: { churchId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "info" | "error"; text: string } | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/resync-from-finix`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error || "Failed to sync from Finix." });
        return;
      }
      if (!data.isTerminated) {
        setMessage({ kind: "info", text: "Finix does not currently report this merchant as terminated — no change made." });
      } else if (data.applied) {
        setMessage({ kind: "success", text: "Synced — this merchant is now marked Terminated." });
        router.refresh();
      } else {
        setMessage({ kind: "info", text: "Already marked Terminated — nothing to update." });
      }
    } catch {
      setMessage({ kind: "error", text: "Failed to sync from Finix." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-60"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Checking Finix…" : "Resync from Finix"}
      </button>
      {message && (
        <span className={`text-[11px] ${message.kind === "error" ? "text-red-600" : message.kind === "success" ? "text-emerald-600" : "text-slate-400"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
