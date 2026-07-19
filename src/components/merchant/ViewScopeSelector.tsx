"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye } from "lucide-react";

export interface ViewScopeMember {
  id: string;
  email: string;
}

/**
 * Reporting-scope dropdown — "Viewing dashboard as X" / "Return to
 * organization view". This is reporting scope only: it filters what
 * dashboard/transactions/giving-links/donors/recurring/subscriptions/exports
 * show, it never swaps the logged-in session or credentials.
 */
export default function ViewScopeSelector({
  members,
  currentScopeLabel,
  isViewingAsOther,
}: {
  members: ViewScopeMember[];
  currentScopeLabel: string;
  isViewingAsOther: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const setScope = async (body: { kind: "organization" | "currentUser" | "user"; userId?: string }) => {
    setBusy(true);
    setOpen(false);
    try {
      await fetch("/api/merchant/view-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const returnToOrganization = async () => {
    setBusy(true);
    try {
      await fetch("/api/merchant/view-scope", { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {isViewingAsOther && (
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full">
          <Eye className="w-3.5 h-3.5" />
          Viewing dashboard as {currentScopeLabel}
          <button onClick={returnToOrganization} disabled={busy} className="underline hover:no-underline disabled:opacity-50">
            Return to organization view
          </button>
        </div>
      )}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          {currentScopeLabel}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-64 max-h-80 overflow-y-auto">
              <button onClick={() => setScope({ kind: "organization" })} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Entire Organization
              </button>
              <button onClick={() => setScope({ kind: "currentUser" })} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                My Activity
              </button>
              {members.length > 0 && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team Member</p>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setScope({ kind: "user", userId: m.id })}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 truncate"
                    >
                      {m.email}
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
