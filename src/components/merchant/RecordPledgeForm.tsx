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
  unitLabel,
  unitAmountCents,
}: {
  pledgeCampaignId: string;
  donors: DonorOption[];
  unitLabel: string | null;
  unitAmountCents: number | null;
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
    const unitCount = form.get("unitCount");

    try {
      const res = await fetch("/api/merchant/pledges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pledgeCampaignId,
          donorId: form.get("donorId") || undefined,
          isAnonymous,
          pledgeAmountCents: amountDollars ? Math.round(Number(amountDollars) * 100) : undefined,
          unitCount: unitCount ? Number(unitCount) : undefined,
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
      {unitAmountCents != null ? (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{unitLabel ? `Number of ${unitLabel}s` : "Units"}</label>
          <input name="unitCount" type="number" min="1" step="1" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Pledge Amount ($)</label>
          <input name="pledgeAmount" type="number" min="0.01" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
      )}
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
