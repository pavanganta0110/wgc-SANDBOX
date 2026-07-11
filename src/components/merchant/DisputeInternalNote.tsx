"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function DisputeInternalNote({
  disputeId,
  initialNote,
  editable,
}: {
  disputeId: string;
  initialNote: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/disputes/${disputeId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      toast.success("Note saved");
      setEditing(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return <p className="text-sm text-slate-600 whitespace-pre-wrap">{initialNote || "No internal notes."}</p>;
  }

  if (!editing) {
    return (
      <div>
        <p className="text-sm text-slate-600 whitespace-pre-wrap mb-2">{initialNote || "No internal notes yet."}</p>
        <button onClick={() => setEditing(true)} className="text-xs font-semibold text-blue-600 hover:underline">
          {initialNote ? "Edit note" : "Add a note"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Internal note — visible only to church admins"
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => {
            setNote(initialNote);
            setEditing(false);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
