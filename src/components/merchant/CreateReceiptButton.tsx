"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function CreateReceiptButton({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);

  const handleClick = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/merchant/transactions/payments/${transferId}/receipt`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send receipt");

      toast.success("Receipt sent to the donor");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to send receipt");
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={sending}
      className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
    >
      {sending ? "Sending..." : "Create Receipt"}
    </button>
  );
}
