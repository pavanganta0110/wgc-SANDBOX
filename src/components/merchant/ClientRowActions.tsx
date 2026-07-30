"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { MoreVertical } from "lucide-react";

export default function ClientRowActions({ clientId, archived }: { clientId: string; archived: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleToggleArchive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/clients/${clientId}/${archived ? "restore" : "archive"}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(archived ? "Client restored." : "Client archived.");
        router.refresh();
      } else {
        toast.error(data.error || "Could not update client.");
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative inline-block text-left">
      <button onClick={() => setOpen((o) => !o)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white rounded-xl border border-slate-100 shadow-lg z-10 py-1">
          <button
            onClick={handleToggleArchive}
            disabled={busy}
            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {archived ? "Restore" : "Archive"}
          </button>
        </div>
      )}
    </div>
  );
}
