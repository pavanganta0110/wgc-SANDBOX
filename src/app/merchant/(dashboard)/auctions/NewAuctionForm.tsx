"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiMessage, fromLocalInput } from "@/lib/auctions/clientFormat";

export default function NewAuctionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant/auctions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: f.get("title"),
        description: f.get("description"),
        format: f.get("format"),
        registrationMode: f.get("registrationMode"),
        startsAt: f.get("startsAt") ? fromLocalInput(String(f.get("startsAt"))) : "",
        endsAt: f.get("endsAt") ? fromLocalInput(String(f.get("endsAt"))) : "",
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(apiMessage(json, "Could not create the auction."));
    router.push(`/merchant/auctions/${json.id}`);
  }

  if (!open) return <button onClick={() => setOpen(true)} className="mb-6 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">New auction</button>;

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="mb-6 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2 text-sm font-medium">Title<input name="title" required className={`${input} mt-1`} placeholder="Spring Gala Auction" /></label>
      <label className="sm:col-span-2 text-sm font-medium">Description<textarea name="description" rows={3} className={`${input} mt-1`} /></label>
      <label className="text-sm font-medium">Bidding opens<input type="datetime-local" name="startsAt" required className={`${input} mt-1`} /></label>
      <label className="text-sm font-medium">Bidding closes<input type="datetime-local" name="endsAt" required className={`${input} mt-1`} /></label>
      <label className="text-sm font-medium">Format
        <select name="format" className={`${input} mt-1`}><option value="SILENT">Silent online auction</option><option value="LIVE">Live room auction (staff enter bids; online bidding also works)</option></select>
      </label>
      <label className="text-sm font-medium">Who can bid
        <select name="registrationMode" className={`${input} mt-1`}><option value="OPEN">Anyone who confirms their email</option><option value="APPROVAL">Only bidders I approve</option></select>
      </label>
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <div className="sm:col-span-2 flex gap-3">
        <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Creating…" : "Create draft"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500">Cancel</button>
      </div>
    </form>
  );
}
