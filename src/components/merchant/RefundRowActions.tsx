"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";

export default function RefundRowActions({
  originalTransferId,
  refundId,
}: {
  originalTransferId: string | null;
  refundId: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const handleCopyRefundId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(refundId);
    toast.success("Refund ID copied");
    setIsOpen(false);
  };

  const handleViewOriginalPayment = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!originalTransferId) return;
    router.push(`/merchant/transactions/payments?id=${originalTransferId}`);
    setIsOpen(false);
  };

  const handleSendReceipt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!originalTransferId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/merchant/transactions/payments/${originalTransferId}/receipt`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to send receipt");
      } else {
        toast.success("Receipt sent");
      }
    } catch {
      toast.error("Failed to send receipt");
    } finally {
      setSending(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 w-52">
            <button
              onClick={handleViewOriginalPayment}
              disabled={!originalTransferId}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              View Original Payment
            </button>
            <button
              onClick={handleCopyRefundId}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Copy Refund ID
            </button>
            <button
              onClick={handleSendReceipt}
              disabled={!originalTransferId || sending}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send Receipt"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
