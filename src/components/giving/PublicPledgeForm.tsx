"use client";

import { useState } from "react";

export default function PublicPledgeForm({
  slug,
  unitLabel,
  unitAmountCents,
  giveNowHref,
}: {
  slug: string;
  unitLabel: string | null;
  unitAmountCents: number | null;
  giveNowHref: string | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pledgeId, setPledgeId] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const amountDollars = form.get("pledgeAmount");
    const unitCount = form.get("unitCount");

    try {
      const res = await fetch(`/api/campaign/${slug}/pledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name") || undefined,
          email: form.get("email") || undefined,
          phone: form.get("phone") || undefined,
          isAnonymous,
          pledgeAmountCents: amountDollars ? Math.round(Number(amountDollars) * 100) : undefined,
          unitCount: unitCount ? Number(unitCount) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || "Could not record your pledge");
        setSubmitting(false);
        return;
      }
      setPledgeId(data.pledgeId ?? null);
      setSuccess(true);
      setSubmitting(false);
    } catch {
      setError("Could not record your pledge");
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="text-center py-6">
        <p className="text-base font-semibold text-slate-900 mb-1">Thank you for your pledge!</p>
        <p className="text-sm text-slate-500 mb-4">We've recorded your promise — you can fulfill it any time.</p>
        {giveNowHref && (
          <a
            href={pledgeId ? `${giveNowHref}?pledgeId=${encodeURIComponent(pledgeId)}` : giveNowHref}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Give now
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <input id="pub-pledge-anonymous" type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
        <label htmlFor="pub-pledge-anonymous" className="text-sm text-slate-700">Pledge anonymously</label>
      </div>
      {!isAnonymous && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
            <input name="name" required={!isAnonymous} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input name="email" type="email" required={!isAnonymous} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone (optional)</label>
            <input name="phone" type="tel" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </>
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
      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Make a Pledge"}
      </button>
    </form>
  );
}
