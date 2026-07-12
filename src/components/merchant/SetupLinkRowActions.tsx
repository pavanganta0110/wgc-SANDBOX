"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function SetupLinkRowActions({ linkId, status }: { linkId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const canResend = status === "SENT" || status === "PENDING" || status === "FAILED" || status === "EXPIRED";
  const canRevoke = status !== "COMPLETED" && status !== "REVOKED";

  const resend = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/subscriptions/setup-links/${linkId}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend");
      toast.success("Setup link resent");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to resend");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm("Revoke this setup link? The donor will no longer be able to use it.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/subscriptions/setup-links/${linkId}/revoke`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke");
      toast.success("Setup link revoked");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 justify-end">
      {canResend && (
        <button disabled={busy} onClick={resend} className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50">
          Resend
        </button>
      )}
      {canRevoke && (
        <button disabled={busy} onClick={revoke} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
          Revoke
        </button>
      )}
    </div>
  );
}
