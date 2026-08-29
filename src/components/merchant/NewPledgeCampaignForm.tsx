"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewPledgeCampaignForm({
  funds,
  givingLinks,
}: {
  funds: { id: string; name: string }[];
  givingLinks: { id: string; publicTitle: string; publicSlug: string }[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const goalDollars = form.get("goalAmount");
    const unitAmountDollars = form.get("unitAmount");

    try {
      const res = await fetch("/api/merchant/pledge-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description") || undefined,
          campaignType: form.get("campaignType"),
          fundId: form.get("fundId") || undefined,
          goalAmountCents: goalDollars ? Math.round(Number(goalDollars) * 100) : undefined,
          startDate: form.get("startDate") || undefined,
          endDate: form.get("endDate") || undefined,
          unitLabel: form.get("unitLabel") || undefined,
          unitAmountCents: unitAmountDollars ? Math.round(Number(unitAmountDollars) * 100) : undefined,
          givingLinkId: form.get("givingLinkId") || undefined,
          publish: form.get("publish") === "on",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create campaign");
        setSubmitting(false);
        return;
      }
      router.push(`/merchant/pledge-campaigns/${data.campaign.id}`);
      router.refresh();
    } catch {
      setError("Could not create campaign");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 max-w-xl">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
        <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Building Fund 2027" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
        <textarea name="description" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
          <select name="campaignType" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="GENERAL">General</option>
            <option value="BUILDING">Building</option>
            <option value="MISSION">Mission</option>
            <option value="EVENT">Event</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fund (optional)</label>
          <select name="fundId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— None —</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Goal Amount ($, optional)</label>
          <input name="goalAmount" type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
          <input name="startDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
          <input name="endDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500 mb-2">Optional — for per-unit pledges (e.g. "$10 per mile").</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Unit Label</label>
            <input name="unitLabel" placeholder="mile" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount per Unit ($)</label>
            <input name="unitAmount" type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Link to Giving Page for "Give now" (optional)</label>
          <select name="givingLinkId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— None —</option>
            {givingLinks.map((g) => (
              <option key={g.id} value={g.id}>{g.publicTitle}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <input id="publish-campaign" name="publish" type="checkbox" />
          <label htmlFor="publish-campaign" className="text-sm text-slate-700">Publish a public donor-facing page for this campaign</label>
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Campaign"}
      </button>
    </form>
  );
}
