"use client";

import { useState } from "react";

export default function UnsubscribeButton({ token, organizationName }: { token: string; organizationName: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function unsubscribe() {
    setState("working");
    try {
      const res = await fetch(`/api/unsubscribe/${encodeURIComponent(token)}`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="text-center" role="status">
        <h1 className="text-lg font-bold text-slate-900 mb-2">You&apos;re unsubscribed</h1>
        <p className="text-sm text-slate-500">{organizationName} won&apos;t send you more campaign emails. It can take a moment for this to reach any message already being sent. Receipts for gifts you make will still arrive.</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-lg font-bold text-slate-900 mb-2">Unsubscribe from {organizationName} emails?</h1>
      <p className="text-sm text-slate-500 mb-6">You&apos;ll stop receiving campaign and update emails from {organizationName}. Receipts and statements for gifts you make are not affected.</p>
      <button type="button" onClick={unsubscribe} disabled={state === "working"} className="w-full py-3 rounded-lg font-semibold text-sm text-white bg-slate-900 disabled:opacity-60">
        {state === "working" ? "Unsubscribing…" : "Yes, unsubscribe me"}
      </button>
      {state === "error" && (
        <p role="alert" className="text-sm text-red-600 mt-3">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
