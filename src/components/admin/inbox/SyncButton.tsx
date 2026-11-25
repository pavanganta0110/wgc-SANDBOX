"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/inbox/sync", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    setNote(res.ok ? `${json.imported} new, ${json.ticketed} ticketed${json.warnings?.length ? ` — problem: ${json.warnings.join(" | ")}` : ""}` : json.error || "Sync failed");
    if (res.ok) router.refresh();
  }
  return (
    <span className="flex items-center gap-2">
      <button onClick={run} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{busy ? "Checking…" : "Check mail now"}</button>
      {note && <span className="text-xs text-slate-500">{note}</span>}
    </span>
  );
}
