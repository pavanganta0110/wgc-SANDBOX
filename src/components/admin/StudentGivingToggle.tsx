"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

/** Admin-only switch: shows the Students section in this organization's dashboard. */
export default function StudentGivingToggle({ churchId, enabled }: { churchId: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/student-giving`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Something went wrong.");
      toast.success(enabled ? "Student Giving turned off" : "Student Giving turned on");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Student Giving</p>
        <p className="text-xs text-gray-500">Adds a Students section (roster, term charges, per-student giving) to this organization&apos;s dashboard.</p>
      </div>
      <button onClick={flip} disabled={busy} className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${enabled ? "bg-gray-600" : "bg-indigo-600"}`}>
        {enabled ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
