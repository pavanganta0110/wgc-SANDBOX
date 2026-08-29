"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DonorOption {
  id: string;
  name: string | null;
  email: string | null;
}

export default function RecordPledgeForm({
  pledgeCampaignId,
  donors,
  campaigns,
}: {
  pledgeCampaignId?: string;
  donors: DonorOption[];
  // When provided, renders a campaign picker instead of trusting a fixed
  // pledgeCampaignId prop — used by the main Pledges page's "Add Pledge"
  // form, which isn't scoped to a single campaign the way the campaign
  // detail page's copy of this form is.
  campaigns?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const amountDollars = form.get("pledgeAmount");
    const selectedCampaignId = pledgeCampaignId || (form.get("pledgeCampaignId") as string);

    if (!selectedCampaignId) {
      setError("Please select a campaign");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/merchant/pledges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pledgeCampaignId: selectedCampaignId,
          donorId: form.get("donorId") || undefined,
          isAnonymous,
          pledgeAmountCents: amountDollars ? Math.round(Number(amountDollars) * 100) : undefined,
          dueDate: form.get("dueDate") || undefined,
          notes: form.get("notes") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not record pledge");
        setSubmitting(false);
        return;
      }
      (e.target as HTMLFormElement).reset();
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Could not record pledge");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {campaigns && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Campaign</label>
          <select name="pledgeCampaignId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required>
            <option value="">— Select campaign —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input id="pledge-anonymous" type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
        <label htmlFor="pledge-anonymous" className="text-sm text-slate-700">Anonymous pledge (no donor)</label>
      </div>
      {!isAnonymous && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Donor</label>
          <select name="donorId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required={!isAnonymous}>
            <option value="">— Select donor —</option>
            {donors.map((d) => (
              <option key={d.id} value={d.id}>{d.name || d.email || d.id}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Pledge Amount ($)</label>
        <input name="pledgeAmount" type="number" min="0.01" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Due Date (optional)</label>
        <input name="dueDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
        <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {submitting ? "Recording…" : "Record Pledge"}
      </button>
    </form>
  );
}
