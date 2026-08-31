"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 208; // w-52
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 320; // rough max height estimate
    const openUpward = spaceBelow < menuHeight && rect.top > menuHeight;
    setMenuPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
      openUpward,
    });
  }, [isOpen]);

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
        ref={buttonRef}
        onClick={() => setIsOpen((o) => !o)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {isOpen && menuPos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-50 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 w-52"
            style={{ top: menuPos.top, left: menuPos.left, transform: menuPos.openUpward ? "translateY(-100%)" : undefined }}
          >
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
        </>,
        document.body
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
