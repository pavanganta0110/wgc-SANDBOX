"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, UserRound } from "lucide-react";

export interface TeamMemberOption {
  id: string;
  label: string;
}

/**
 * "Credited to" for an event: whose gifts this event counts toward. Editable
 * only by people who can reassign giving pages; everyone else just sees it.
 */
export default function EventFundraiserPicker({
  eventId,
  currentUserId,
  currentLabel,
  members,
}: {
  eventId: string;
  currentUserId: string | null;
  currentLabel: string | null;
  /** Present only when the viewer may change the assignment. */
  members?: TeamMemberOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentUserId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/events/${eventId}/fundraiser`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: value }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't assign the event.");
      toast.success("Event assigned. New gifts will be credited to them.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't assign the event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm shadow-sm">
      <UserRound className="h-4 w-4 text-slate-400" aria-hidden />
      <span className="font-semibold text-slate-700">Assigned fundraiser</span>
      {members ? (
        <>
          <label className="sr-only" htmlFor="event-fundraiser">
            Assigned fundraiser
          </label>
          <select
            id="event-fundraiser"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {!currentUserId && <option value="">Not assigned</option>}
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={save}
            disabled={saving || !value || value === (currentUserId ?? "")}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save
          </button>
          <span className="w-full text-xs text-slate-500 sm:w-auto">Ticket and donation gifts from now on count toward this person. Past gifts don&apos;t change.</span>
        </>
      ) : (
        <span className="text-slate-600">{currentLabel ?? "Not assigned"}</span>
      )}
    </div>
  );
}
