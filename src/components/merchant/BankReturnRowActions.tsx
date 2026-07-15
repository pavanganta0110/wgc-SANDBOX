"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";

export default function BankReturnRowActions({
  originalTransferId,
  bankReturnId,
}: {
  originalTransferId: string | null;
  bankReturnId: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(bankReturnId);
    toast.success("Bank Return ID copied");
    setIsOpen(false);
  };

  const handleViewOriginalPayment = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!originalTransferId) return;
    router.push(`/merchant/transactions/payments?id=${originalTransferId}`);
    setIsOpen(false);
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
              onClick={handleCopyId}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Copy Bank Return ID
            </button>
          </div>
        </>
      )}
    </div>
  );
}
