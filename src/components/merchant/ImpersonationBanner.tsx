"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

/**
 * Persistent, unmissable strip shown on every merchant dashboard page while
 * a WGC admin is impersonating that organization (see
 * src/app/merchant/(dashboard)/layout.tsx, which renders this above every
 * other banner whenever requireMerchantSession() returns auth.impersonation).
 * Exiting only ever clears the impersonation cookie/session — the admin's
 * own wgc_session is never touched, so this never logs the admin out.
 */
export default function ImpersonationBanner({ orgName }: { orgName: string }) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  const handleExit = async () => {
    setExiting(true);
    try {
      const res = await fetch("/api/admin/impersonate/exit", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      router.push(data.redirectTo || "/admin/merchants");
      router.refresh();
    } finally {
      setExiting(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-4 px-6 md:px-10 py-2.5 bg-amber-400 text-amber-950 text-sm font-semibold">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span className="truncate">
          Admin View — You are viewing <span className="font-bold">{orgName}</span>
        </span>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-950 text-amber-50 text-xs font-bold hover:bg-amber-900 transition-colors disabled:opacity-60"
      >
        {exiting ? "Exiting…" : "Exit Merchant View"}
      </button>
    </div>
  );
}
