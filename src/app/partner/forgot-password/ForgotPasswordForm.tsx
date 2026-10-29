"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/partner/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json().catch(() => ({}));
      setMessage({ text: res.ok ? data.message : data.error || "Something went wrong. Please try again.", error: !res.ok });
    } catch {
      setMessage({ text: "Something went wrong. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-600 mb-1">
          Email
        </label>
        <input id="forgot-email" type="email" autoComplete="username" placeholder=" " required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#010409] text-white font-bold text-sm py-3 disabled:opacity-60">
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm">
        <Link href="/partner/login" className="font-semibold text-slate-700">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
