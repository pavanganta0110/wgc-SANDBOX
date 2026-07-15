"use client";

import { useState } from "react";
import toast from "react-hot-toast";

export default function DataPrivacyPanel() {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const requestClosure = async () => {
    if (!window.confirm("Request account closure? WGC Support will follow up to confirm and complete this request.")) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/merchant/settings/data-privacy/request-closure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");
      toast.success("Account closure request submitted");
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-6 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500 mb-2">Account Closure</p>
      <p className="text-xs text-slate-500 mb-3">
        Closing your account is handled by WGC Support to make sure any pending payouts and financial records are handled correctly. This does not close your account immediately — it opens a support request.
      </p>
      {submitted ? (
        <p className="text-sm text-green-700 font-medium">Request submitted. WGC Support will follow up by email.</p>
      ) : (
        <>
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 mb-3"
            rows={3}
            placeholder="Optional: tell us why you're closing your account"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            onClick={requestClosure}
            disabled={submitting}
            className="px-4 py-2 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Request Account Closure"}
          </button>
        </>
      )}
    </div>
  );
}
