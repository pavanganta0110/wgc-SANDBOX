"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Never renders the raw error message from a failed query — a processor or
// database error string is not something an organization user should see.
export default function DonorsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Donors list failed to load:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <h3 className="text-sm font-bold text-slate-900 mb-1">Donors failed to load</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-4">
        Something went wrong loading your donors. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
      >
        Retry
      </button>
    </div>
  );
}
