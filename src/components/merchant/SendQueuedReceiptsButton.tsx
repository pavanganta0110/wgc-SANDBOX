"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface Job {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
}

export default function SendQueuedReceiptsButton({ queuedCount }: { queuedCount: number }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);

  if (queuedCount === 0) return null;

  const run = async () => {
    setBusy(true);
    try {
      const createRes = await fetch("/api/merchant/donations/external/receipts/jobs", { method: "POST" });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Failed to start sending");
      let current: Job = createData.job;
      setJob(current);

      while (current.status === "PENDING" || current.status === "RUNNING") {
        const stepRes = await fetch(`/api/merchant/donations/external/receipts/jobs/${current.id}/process`, { method: "POST" });
        const stepData = await stepRes.json();
        if (!stepRes.ok) throw new Error(stepData.error || "Sending failed");
        current = stepData.job;
        setJob(current);
      }

      const parts = [`${current.succeededCount} sent`];
      if (current.failedCount > 0) parts.push(`${current.failedCount} failed`);
      if (current.skippedCount > 0) parts.push(`${current.skippedCount} skipped`);
      toast.success(`Receipts: ${parts.join(", ")}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send queued receipts");
    } finally {
      setBusy(false);
      setJob(null);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {busy && job ? `Sending ${job.processedCount}/${job.totalCount}…` : busy ? "Starting…" : `Send Queued Receipts (${queuedCount})`}
    </button>
  );
}
