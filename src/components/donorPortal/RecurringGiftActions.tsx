"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  slug: string;
  subscriptionId: string;
  /** Donation amount before any covered fee, in cents; null when this gift can't be edited online. */
  donationAmountCents: number | null;
  isPledge: boolean;
}

type Mode = "IDLE" | "AMOUNT" | "CANCEL";

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

export default function RecurringGiftActions({ slug, subscriptionId, donationAmountCents, isPledge }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("IDLE");
  const [amount, setAmount] = useState(donationAmountCents ? (donationAmountCents / 100).toFixed(2) : "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per intent: a double-click or retry of the same action can never apply twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const base = `/api/donor-portal/subscriptions/${subscriptionId}`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (isPledge) return <p className="text-xs text-slate-400">Part of a pledge — contact the organization to change it.</p>;

  const link = "text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50";

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-4">
        {donationAmountCents != null && <button type="button" className={link} onClick={() => { setMode("AMOUNT"); setError(null); }}>Change amount</button>}
        <button
          type="button"
          className={link}
          disabled={busy}
          onClick={() => run(async () => {
            const data = await post(`${base}/payment-update`, { slug });
            window.location.href = data.url;
          })}
        >
          Update card
        </button>
        <button type="button" className="text-xs font-medium text-red-600 hover:text-red-500" onClick={() => { setMode("CANCEL"); setError(null); }}>Cancel</button>
      </div>

      {mode === "AMOUNT" && (
        <form
          className="space-y-2 rounded-lg bg-slate-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await post(`${base}/update-amount`, { slug, idempotencyKey, newDonationAmountCents: Math.round(Number(amount) * 100), consentConfirmed: confirmed });
              setMode("IDLE");
              router.refresh();
            });
          }}
        >
          <label className="block text-xs text-slate-600">
            New gift amount (USD)
            <input type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            I authorize this recurring gift to continue at the new amount on its current schedule.
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={busy || !confirmed} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="text-xs text-slate-500" onClick={() => setMode("IDLE")}>Never mind</button>
          </div>
        </form>
      )}

      {mode === "CANCEL" && (
        <div className="space-y-2 rounded-lg bg-red-50 p-3">
          <p className="text-xs text-red-800">Cancel this recurring gift? No future gifts will be charged.</p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => run(async () => {
                await post(`${base}/cancel`, { slug, idempotencyKey });
                setMode("IDLE");
                router.refresh();
              })}
            >
              {busy ? "Canceling…" : "Yes, cancel it"}
            </button>
            <button type="button" className="text-xs text-slate-600" onClick={() => setMode("IDLE")}>Keep it</button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
