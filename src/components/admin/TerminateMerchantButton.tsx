"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  TERMINATION_CONFIRM_WORD,
  TERMINATION_REASONS,
  MAX_TERMINATION_DESCRIPTION,
  confirmationMatches,
} from "@/lib/onboarding/terminationConfirmation";

const labelFor = (r: string) => r.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Permanent merchant termination. The confirm button stays disabled until the
 * admin types the org's exact name and the word TERMINATE; the server
 * re-checks both, so this is a guard against slips, not the security boundary.
 */
export default function TerminateMerchantButton({ churchId, churchName }: { churchId: string; churchName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    confirmationMatches(confirmName, churchName) &&
    confirmWord === TERMINATION_CONFIRM_WORD &&
    reason !== "" &&
    description.trim().length >= 10;

  const close = () => {
    if (loading) return;
    setOpen(false);
    setConfirmName("");
    setConfirmWord("");
    setReason("");
    setDescription("");
    setError(null);
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName, confirmWord, reason, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to terminate this merchant.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Failed to terminate this merchant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Terminate merchant
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-rose-700">Terminate {churchName}</h3>
            <p className="mt-2 text-sm text-slate-700">
              This permanently closes the account. Payments, settlements and refunds stop, billing is cancelled, and it cannot be undone from here.
            </p>

            <label className="mt-4 block text-sm font-medium text-slate-900">Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choose a reason…</option>
              {TERMINATION_REASONS.map((r) => (
                <option key={r} value={r}>{labelFor(r)}</option>
              ))}
            </select>

            <label className="mt-3 block text-sm font-medium text-slate-900">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_TERMINATION_DESCRIPTION}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Why is this account being terminated?"
            />

            <label className="mt-3 block text-sm font-medium text-slate-900">
              Type the organization name: <span className="font-mono font-semibold">{churchName}</span>
            </label>
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />

            <label className="mt-3 block text-sm font-medium text-slate-900">
              Type <span className="font-mono font-semibold">{TERMINATION_CONFIRM_WORD}</span>
            </label>
            <input value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} autoComplete="off" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />

            {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={close} disabled={loading} className="rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!ready || loading}
                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Terminating…" : "Terminate permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
