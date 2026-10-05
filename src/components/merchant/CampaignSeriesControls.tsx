"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

/** Pause / resume / stop for a repeating (monthly) Giving Campaign. */
export default function CampaignSeriesControls({ id, paused }: { id: string; paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "pause" | "resume" | "stop") {
    if (action === "stop" && !window.confirm("Stop this repeating campaign for good? Past sends stay in your history, and no more will go out.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/giving-campaigns/${id}/series`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't update the campaign.");
      toast.success(action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Stopped");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the campaign.");
    } finally {
      setBusy(false);
    }
  }

  const btn = "px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return (
    <span className="inline-flex gap-2">
      {paused ? (
        <button type="button" className={btn} disabled={busy} onClick={() => void act("resume")}>Resume</button>
      ) : (
        <button type="button" className={btn} disabled={busy} onClick={() => void act("pause")}>Pause</button>
      )}
      <button type="button" className={`${btn} text-red-600`} disabled={busy} onClick={() => void act("stop")}>Stop</button>
    </span>
  );
}
