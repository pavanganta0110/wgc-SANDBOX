"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Progress {
  jobId: string;
  status: string;
  total: number;
  counts: Record<string, number>;
  remaining: number;
  done: boolean;
}

/** Runs the import a few rows at a time and shows progress; also the undo button. Staff only. */
export default function RecurringJobRunner({ churchId, jobId, initial, autostart }: { churchId: string; jobId: string; initial: Progress; autostart: boolean }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const started = useRef(false);
  const base = `/api/admin/merchants/${churchId}/migration/recurring/${jobId}`;

  async function run() {
    setRunning(true);
    setError(null);
    stop.current = false;
    try {
      for (let i = 0; i < 2000 && !stop.current; i++) {
        const res = await fetch(`${base}/process`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "The import stopped.");
        setProgress(data.progress);
        if (data.progress.done) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import stopped.");
    }
    setRunning(false);
    router.refresh();
  }

  async function undo() {
    const reason = window.prompt("Cancel every subscription this import created. Why?");
    if (!reason || !reason.trim()) return;
    setRunning(true);
    setError(null);
    try {
      for (let i = 0; i < 500; i++) {
        const res = await fetch(`${base}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not cancel.");
        if (data.progress) setProgress(data.progress);
        if (data.result.remaining === 0 || data.result.canceled + data.result.failed === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
    }
    setRunning(false);
    router.refresh();
  }

  useEffect(() => {
    if (autostart && !started.current && initial.remaining > 0) {
      started.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imported = progress.counts.IMPORTED ?? 0;
  const pct = progress.total ? Math.round(((progress.total - progress.remaining) / progress.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">Status: {progress.status.replace(/_/g, " ").toLowerCase()}</p>
          <p className="text-sm text-slate-500">
            {imported} of {progress.total} imported
            {progress.counts.FAILED ? `, ${progress.counts.FAILED} failed` : ""}
            {progress.counts.NEEDS_REVIEW ? `, ${progress.counts.NEEDS_REVIEW} need review` : ""}
            {progress.counts.ROLLED_BACK ? `, ${progress.counts.ROLLED_BACK} canceled` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {progress.remaining > 0 && (
            <button type="button" disabled={running} onClick={run} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {running ? "Importing…" : imported > 0 ? "Continue the import" : "Start the import"}
            </button>
          )}
          {running && (
            <button type="button" onClick={() => (stop.current = true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Pause</button>
          )}
          {imported > 0 && (
            <button type="button" disabled={running} onClick={undo} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Cancel what was imported</button>
          )}
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
