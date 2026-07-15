"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Send } from "lucide-react";

interface GivingLinkOption {
  id: string;
  publicTitle: string;
}

export default function SendGivingLinkButton({ donorEmail }: { donorEmail: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<GivingLinkOption[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [sending, setSending] = useState(false);

  const openPicker = async () => {
    setOpen(true);
    if (links) return;
    try {
      const res = await fetch("/api/merchant/giving-links?status=ACTIVE");
      if (!res.ok) throw new Error("Failed to load giving links");
      const data = await res.json();
      setLinks(data.links ?? []);
    } catch {
      setLinks([]);
      toast.error("Failed to load giving links");
    }
  };

  const send = async () => {
    if (!selectedId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/merchant/giving-links/${selectedId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "EMAIL", recipient: donorEmail }),
      });
      if (!res.ok) throw new Error("Failed to send giving link");
      toast.success(`Giving link sent to ${donorEmail}`);
      setOpen(false);
      setSelectedId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send giving link");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={openPicker}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Send className="w-4 h-4" />
        Send Giving Link
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-72">
            <p className="text-xs font-semibold text-slate-500 mb-2">Send to {donorEmail}</p>
            {links === null ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : links.length === 0 ? (
              <p className="text-sm text-slate-500">No active giving links to send.</p>
            ) : (
              <>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none mb-3"
                >
                  <option value="">Choose a giving link…</option>
                  {links.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.publicTitle}
                    </option>
                  ))}
                </select>
                <button
                  onClick={send}
                  disabled={!selectedId || sending}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
