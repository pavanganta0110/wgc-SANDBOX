"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function CancelSubscriptionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const confirmCancel = async () => {
    setCanceling(true);
    try {
      const res = await fetch("/api/merchant/subscription/cancel", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to cancel subscription");
      toast.success("Your subscription has been canceled.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel subscription");
    } finally {
      setCanceling(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-full border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50"
      >
        Cancel Subscription
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Cancel your WGC Platform subscription?</h3>
            <p className="text-sm text-slate-600 mb-4">
              Your subscription will be canceled effective immediately. No future charges will occur. All of your donation, donor, and
              financial history will be preserved.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Keep Subscription
              </button>
              <button
                onClick={confirmCancel}
                disabled={canceling}
                className="px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {canceling ? "Canceling…" : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
