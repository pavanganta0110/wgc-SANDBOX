"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { extractApiErrorMessage } from "@/lib/utils/apiErrors";

export default function EmailLogResendButton({ emailLogId }: { emailLogId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCcField, setShowCcField] = useState(false);
  const [ccInput, setCcInput] = useState("");

  async function handleResend() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/email-logs/${emailLogId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalRecipients: ccInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(extractApiErrorMessage(data, "Could not resend"));
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not resend");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleResend}
          disabled={submitting}
          className="text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50"
        >
          {submitting ? "Resending…" : "Resend"}
        </button>
        <button
          type="button"
          onClick={() => setShowCcField((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
        >
          {showCcField ? "hide" : "+ also send to others"}
        </button>
      </div>
      {showCcField && (
        <input
          type="text"
          value={ccInput}
          onChange={(e) => setCcInput(e.target.value)}
          placeholder="spouse@example.com, bookkeeper@example.com"
          className="mt-1 w-56 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
        />
      )}
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}
