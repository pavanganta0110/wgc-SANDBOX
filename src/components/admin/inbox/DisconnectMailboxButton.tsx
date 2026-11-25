"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DisconnectMailboxButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!window.confirm("Disconnect this mailbox? WGC deletes its stored token and its copied mail. Tickets already made stay.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/inbox/mailboxes/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
  }
  return <button onClick={run} disabled={busy} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-50">{busy ? "Disconnecting…" : "Disconnect"}</button>;
}
