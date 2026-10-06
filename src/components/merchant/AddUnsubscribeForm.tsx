"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

/** Adds an address to the do-not-email list by hand — for someone who asked to be removed by replying to an email. */
export default function AddUnsubscribeForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/merchant/giving-campaigns/unsubscribed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't add that address.");
      toast.success("Added — they won't be emailed again");
      setEmail("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that address.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[16rem]">
        <label htmlFor="unsub-email" className="block text-xs font-semibold text-slate-500 mb-1">Someone asked to stop getting your emails?</label>
        <input id="unsub-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
      </div>
      <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">
        {busy ? "Adding…" : "Add to do-not-email list"}
      </button>
    </form>
  );
}
