"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function PossibleMatchActions({ matchId, redirectToListOnResolve }: { matchId: string; redirectToListOnResolve?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (action: "confirm" | "reject" | "skip", confirmMessage?: string) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/merchant/donors/matches/${matchId}/${action}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed to ${action} match`);
      toast.success(
        action === "confirm" ? "Donors merged" : action === "reject" ? "Marked as separate donors" : "Postponed for later review",
      );
      if (redirectToListOnResolve) router.push("/merchant/donors/matches");
      else router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} match`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => act("confirm", "Merge these two donor records? All external donations, notes, and history from the newer record will move to the existing donor. This cannot be undone from here.")}
        disabled={busy !== null}
        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy === "confirm" ? "Merging…" : "Confirm match"}
      </button>
      <button
        onClick={() => act("reject", "Mark these as two different people? The newer donor record will stay separate.")}
        disabled={busy !== null}
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
      >
        {busy === "reject" ? "Saving…" : "Not a match"}
      </button>
      <button
        onClick={() => act("skip")}
        disabled={busy !== null}
        className="px-3 py-1.5 rounded-lg text-slate-500 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
      >
        {busy === "skip" ? "…" : "Skip for now"}
      </button>
    </div>
  );
}
