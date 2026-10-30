"use client";

import { useState } from "react";

/** The sign-in shown inside a partner's frame when its product has one shared login: each person types their own email and passcode. */
export default function EmbedPasscodeSignIn({ link }: { link: string }) {
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/partner-embed/passcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link, email, passcode }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; next?: string; error?: string };
      if (res.ok && data.ok) {
        window.location.assign(data.next ?? "/merchant/dashboard");
        return;
      }
      setError(data.error ?? "Could not sign you in. Try again.");
      setPasscode("");
    } catch {
      setError("Could not reach WGC Payments. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <main className="max-w-md w-full mx-auto px-6 py-14">
      <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Sign in to WGC Payments</h1>
      <p className="text-slate-600 text-center mb-8">Use your own email and passcode. Your administrator gave you the passcode.</p>
      <form onSubmit={signIn} className="space-y-4">
        <div>
          <label htmlFor="embed-email" className="block text-sm font-semibold text-slate-800 mb-1.5">
            Email
          </label>
          <input id="embed-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-[#eab308]" />
        </div>
        <div>
          <label htmlFor="embed-passcode" className="block text-sm font-semibold text-slate-800 mb-1.5">
            Passcode
          </label>
          <input id="embed-passcode" type="password" required autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-[#eab308]" />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="w-full metallic-gold px-6 py-3 text-sm font-bold rounded-xl shadow-lg text-slate-900 disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
