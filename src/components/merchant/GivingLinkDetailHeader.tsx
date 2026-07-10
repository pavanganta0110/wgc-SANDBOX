"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Share2, Pin } from "lucide-react";
import toast from "react-hot-toast";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import ShareGivingLinkModal from "@/components/merchant/ShareGivingLinkModal";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";

export default function GivingLinkDetailHeader({
  id,
  internalName,
  publicSlug,
  publicTitle,
  status,
  createdAt,
}: {
  id: string;
  internalName: string;
  publicSlug: string;
  publicTitle: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED" | "ARCHIVED";
  createdAt: Date;
}) {
  const router = useRouter();
  const [showShare, setShowShare] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${appUrl}/g/${publicSlug}`;

  const handleSetStatus = async (newStatus: string) => {
    setBusy(true);
    const res = await fetch(`/api/merchant/giving-links/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setBusy(false);
    setIsMenuOpen(false);
    if (!res.ok) {
      toast.error("Failed to update giving link status");
      return;
    }
    toast.success("Giving link updated");
    router.refresh();
  };

  const handleDuplicate = async () => {
    setBusy(true);
    const res = await fetch(`/api/merchant/giving-links/${id}/duplicate`, { method: "POST" });
    setBusy(false);
    setIsMenuOpen(false);
    if (!res.ok) {
      toast.error("Failed to duplicate giving link");
      return;
    }
    const data = await res.json();
    toast.success("Giving link duplicated");
    router.push(`/merchant/giving-links/${data.link.id}/edit`);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
        <span>Giving Link · {formatDateTimeCDT(createdAt)}</span>
        <div className="flex items-center gap-1.5">
          <CopyableIdBadge id={id} />
          <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Pin">
            <Pin className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900">{internalName}</h1>
          <StateBadge state={status} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Share2 className="w-4 h-4" />
            Share Link
          </button>
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen((o) => !o)}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 w-52">
                  {status !== "ARCHIVED" && (
                    <button
                      onClick={() => { setIsMenuOpen(false); router.push(`/merchant/giving-links/${id}/edit`); }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  )}
                  <button onClick={handleDuplicate} disabled={busy} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    Duplicate
                  </button>
                  {status === "INACTIVE" && (
                    <button onClick={() => handleSetStatus("ACTIVE")} disabled={busy} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                      Activate
                    </button>
                  )}
                  {status === "ACTIVE" && (
                    <button onClick={() => handleSetStatus("INACTIVE")} disabled={busy} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                      Deactivate
                    </button>
                  )}
                  {status !== "ARCHIVED" && (
                    <button onClick={() => handleSetStatus("ARCHIVED")} disabled={busy} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40">
                      Archive
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showShare && (
        <ShareGivingLinkModal givingLinkId={id} publicTitle={publicTitle} publicUrl={publicUrl} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
