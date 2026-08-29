"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EmailLogResendButton({ emailLogId }: { emailLogId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/email-logs/${emailLogId}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not resend");
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
      <button
        onClick={handleResend}
        disabled={submitting}
        className="text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50"
      >
        {submitting ? "Resending…" : "Resend"}
      </button>
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}
