"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function FundraiserEditForm({
  initial,
}: {
  initial: { displayName: string; personalStory: string | null; imageUrl: string | null; goalAmountCents: number | null };
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [personalStory, setPersonalStory] = useState(initial.personalStory ?? "");
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? "");
  const [goalDollars, setGoalDollars] = useState(initial.goalAmountCents != null ? String(initial.goalAmountCents / 100) : "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/fundraiser-portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          personalStory: personalStory || null,
          imageUrl: imageUrl || null,
          goalAmountCents: goalDollars ? Math.round(parseFloat(goalDollars) * 100) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success("Saved");
      router.push("/fundraiser");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Display Name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Your Story</label>
        <textarea value={personalStory} onChange={(e) => setPersonalStory(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Photo URL</label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Goal Amount ($)</label>
        <input value={goalDollars} onChange={(e) => setGoalDollars(e.target.value)} type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={saving} className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
