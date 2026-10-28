"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { CurrentTermForm } from "@/components/merchant/students/StudentActions";

/**
 * Organization-level switch for Student Giving. Turning it on adds the
 * Students section to the sidebar (the layout re-renders on refresh);
 * turning it off hides it again without deleting any students or gifts.
 */
export default function StudentGivingSettings({
  enabled,
  currentTerm,
  canManage,
}: {
  enabled: boolean;
  currentTerm: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setEnabled(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/merchant/students/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Something went wrong.");
      toast.success(next ? "Student Giving is on — Students now appears in the sidebar" : "Student Giving is off");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Student Giving</h3>
            <p className="text-xs text-slate-500 max-w-xl">
              For schools and colleges: tie each gift to a student, see per term who is fully credited and who gave, and export a reconciliation
              file for your finance team. Turning it on adds a <strong>Students</strong> section to your sidebar. Turning it off hides it again;
              nothing is deleted.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Student Giving"
            disabled={!canManage || busy}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-indigo-600" : "bg-slate-300"}`}
          >
            {busy ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin text-white" aria-hidden />
            ) : (
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
            )}
          </button>
        </div>
        {!canManage && <p className="mt-3 text-xs text-amber-700">Only an organization owner or admin can change this.</p>}
      </div>

      {enabled && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Current term</h3>
            <p className="text-xs text-slate-500">
              The semester that gifts from your giving pages are credited to, for example &ldquo;Fall 2026&rdquo;.
            </p>
          </div>
          {canManage ? <CurrentTermForm currentTerm={currentTerm} /> : <p className="text-sm text-slate-700">{currentTerm || "Not set"}</p>}
          <Link href="/merchant/students" className="inline-block text-sm font-semibold text-indigo-600 hover:underline">
            Go to Students →
          </Link>
        </div>
      )}
    </div>
  );
}
