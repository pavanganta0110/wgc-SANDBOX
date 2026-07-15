"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import ShareGivingLinkModal from "@/components/merchant/ShareGivingLinkModal";

export default function GivingLinkRowActions({
  id,
  publicSlug,
  publicTitle,
  status,
}: {
  id: string;
  publicSlug: string;
  publicTitle: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED" | "ARCHIVED";
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [busy, setBusy] = useState(false);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${appUrl}/g/${publicSlug}`;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const handleCopyLink = async (e: React.MouseEvent) => {
    stop(e);
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied to clipboard");
    setIsOpen(false);
    fetch(`/api/merchant/giving-links/${id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "COPY_LINK" }),
    }).catch(() => {});
  };

  const handleOpenPublicPage = (e: React.MouseEvent) => {
    stop(e);
    window.open(publicUrl, "_blank", "noopener,noreferrer");
    setIsOpen(false);
  };

  const handleViewDetails = (e: React.MouseEvent) => {
    stop(e);
    router.push(`/merchant/giving-links/${id}`);
    setIsOpen(false);
  };

  const handleEdit = (e: React.MouseEvent) => {
    stop(e);
    router.push(`/merchant/giving-links/${id}/edit`);
    setIsOpen(false);
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    stop(e);
    setBusy(true);
    const res = await fetch(`/api/merchant/giving-links/${id}/duplicate`, { method: "POST" });
    setBusy(false);
    setIsOpen(false);
    if (!res.ok) {
      toast.error("Failed to duplicate giving link");
      return;
    }
    const data = await res.json();
    toast.success("Giving link duplicated");
    router.push(`/merchant/giving-links/${data.link.id}/edit`);
  };

  const handleSetStatus = async (newStatus: string, e: React.MouseEvent) => {
    stop(e);
    setBusy(true);
    const res = await fetch(`/api/merchant/giving-links/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setBusy(false);
    setIsOpen(false);
    if (!res.ok) {
      toast.error("Failed to update giving link status");
      return;
    }
    toast.success(
      newStatus === "ACTIVE" ? "Giving link activated" : newStatus === "INACTIVE" ? "Giving link deactivated" : "Giving link archived"
    );
    router.refresh();
  };

  return (
    <div className="relative inline-block" onClick={stop}>
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
            <button onClick={handleViewDetails} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              View Details
            </button>
            <button
              onClick={(e) => { stop(e); setShowShare(true); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Share Link
            </button>
            <button onClick={handleCopyLink} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Copy Link
            </button>
            <button onClick={handleOpenPublicPage} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Open Public Page
            </button>
            {status !== "ARCHIVED" && (
              <button onClick={handleEdit} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Edit
              </button>
            )}
            <button onClick={handleDuplicate} disabled={busy} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              Duplicate
            </button>
            {status === "INACTIVE" && (
              <button onClick={(e) => handleSetStatus("ACTIVE", e)} disabled={busy} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                Activate
              </button>
            )}
            {status === "ACTIVE" && (
              <button onClick={(e) => handleSetStatus("INACTIVE", e)} disabled={busy} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                Deactivate
              </button>
            )}
            {status !== "ARCHIVED" && (
              <button onClick={(e) => handleSetStatus("ARCHIVED", e)} disabled={busy} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40">
                Archive
              </button>
            )}
          </div>
        </>
      )}

      {showShare && (
        <ShareGivingLinkModal
          givingLinkId={id}
          publicTitle={publicTitle}
          publicUrl={publicUrl}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
