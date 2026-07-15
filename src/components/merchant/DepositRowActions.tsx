"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";

export default function DepositRowActions({
  depositId,
  settlementId,
}: {
  depositId: string;
  settlementId: string | null;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(depositId);
    toast.success("Deposit ID copied");
    setIsOpen(false);
  };

  const handleViewSettlement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!settlementId) return;
    router.push(`/merchant/settlements?id=${settlementId}`);
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
              onClick={handleViewSettlement}
              disabled={!settlementId}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              View Settlement
            </button>
            <button
              onClick={handleCopyId}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Copy Deposit ID
            </button>
          </div>
        </>
      )}
    </div>
  );
}
