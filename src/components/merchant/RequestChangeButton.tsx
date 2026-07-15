"use client";

import { useState } from "react";
import toast from "react-hot-toast";

export default function RequestChangeButton({ area, label }: { area: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!details.trim()) {
      toast.error("Please describe the change you're requesting");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/merchant/organization/request-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, details }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");
      toast.success("Request submitted — WGC Support will follow up");
      setOpen(false);
      setDetails("");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-blue-600 hover:underline">
        Request Change
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 bg-slate-50 rounded-lg">
      <p className="text-xs font-semibold text-slate-700 mb-1">{label}</p>
      <textarea
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 mb-2"
        rows={2}
        placeholder="Describe the change you need"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={submitting} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50">
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">
          Cancel
        </button>
      </div>
    </div>
  );
}
