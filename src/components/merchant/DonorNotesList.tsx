"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";

export interface DonorNoteItem {
  id: string;
  body: string;
  createdByEmail: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export default function DonorNotesList({
  donorId,
  initialNotes,
  editable,
  limit,
}: {
  donorId: string;
  initialNotes: DonorNoteItem[];
  editable: boolean;
  limit?: number;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const visibleNotes = limit ? notes.slice(0, limit) : notes;

  const addNote = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) throw new Error("Failed to add note");
      const { note } = await res.json();
      setNotes([note, ...notes]);
      setDraft("");
      setAdding(false);
      toast.success("Note added");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to add note");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (noteId: string) => {
    if (!editDraft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editDraft }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      setNotes(notes.map((n) => (n.id === noteId ? { ...n, body: editDraft, updatedAt: new Date().toISOString() } : n)));
      setEditingId(null);
      toast.success("Note updated");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      setNotes(notes.filter((n) => n.id !== noteId));
      toast.success("Note deleted");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete note");
    }
  };

  return (
    <div>
      {visibleNotes.length === 0 && !adding ? (
        <p className="text-sm text-slate-500">
          Add an internal note to help your organization keep track of important donor information.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleNotes.map((note) => (
            <div key={note.id} className="border-b border-slate-50 last:border-0 pb-3 last:pb-0">
              {editingId === note.id ? (
                <div>
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={2}
                    maxLength={4000}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => saveEdit(note.id)}
                      disabled={saving}
                      className="px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.body}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-slate-400">
                      {note.createdByEmail || "System"} · {formatDateTimeCDT(note.createdAt)}
                    </p>
                    {editable && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingId(note.id);
                            setEditDraft(note.body);
                          }}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button onClick={() => deleteNote(note.id)} className="text-xs font-semibold text-red-600 hover:underline">
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="mt-3">
          {adding ? (
            <div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={4000}
                placeholder="Internal note — visible only inside this organization's dashboard"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  onClick={addNote}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Add Note"}
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setDraft("");
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="text-xs font-semibold text-blue-600 hover:underline">
              Add Note
            </button>
          )}
        </div>
      )}
    </div>
  );
}
