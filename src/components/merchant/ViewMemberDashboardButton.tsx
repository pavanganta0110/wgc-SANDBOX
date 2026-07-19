"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

/**
 * Sets the existing reporting view-scope cookie to this member and opens
 * the main dashboard — same POST /api/merchant/view-scope mechanism as
 * ViewScopeSelector's per-member option, just entered from the team-member
 * detail page instead of the dropdown. Reporting scope only, never a
 * session/credential swap (see viewScope.ts).
 */
export default function ViewMemberDashboardButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const view = async () => {
    setBusy(true);
    try {
      await fetch("/api/merchant/view-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "user", userId }),
      });
      router.push("/merchant/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={view}
      disabled={busy}
      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      <Eye className="w-4 h-4" />
      View Dashboard
    </button>
  );
}
