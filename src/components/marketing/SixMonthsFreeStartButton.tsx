"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * The only client-side entry point into the trusted promotion-attribution
 * flow. Deliberately sends no promo code, amount, or duration to the
 * server — the server decides all of that (see /api/promo/six-months-free/start).
 * The click is what starts the server-trusted lead + cookie; the redirect
 * target (/start) never itself needs to know the promotion exists.
 */
export default function SixMonthsFreeStartButton({ 
  className, 
  children 
}: { 
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/promo/six-months-free/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong — please try again.");
      router.push(body.redirectTo || "/start");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong — please try again.");
      setLoading(false);
    }
  };

  return (
    <button
      onClick={start}
      disabled={loading}
      className={className || "inline-flex items-center gap-2 px-8 py-4 rounded-full bg-slate-900 text-white font-semibold text-lg hover:bg-slate-800 disabled:opacity-60"}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : children || <>Start 90 Days Free <ArrowRight className="w-5 h-5" /></>}
    </button>
  );
}
