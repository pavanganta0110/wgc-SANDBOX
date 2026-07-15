"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function DonorProfileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Donor profile failed to load:", error);
  }, [error]);

  return (
    <div>
      <Link href="/merchant/donors" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Donors
      </Link>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 mb-1">This donor profile failed to load</h3>
        <p className="text-sm text-slate-500 max-w-sm mb-4">Something went wrong. Please try again.</p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
