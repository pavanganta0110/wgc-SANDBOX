"use client";

import { useState } from "react";

export default function PartnerLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.");
        return;
      }
      window.location.assign("/partner/organizations");
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="partner-email" className="block text-xs font-semibold text-slate-600 mb-1">
          Email
        </label>
        <input
          id="partner-email"
          type="email"
          autoComplete="username"
          placeholder=" "
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
        />
      </div>
      <div>
        <label htmlFor="partner-password" className="block text-xs font-semibold text-slate-600 mb-1">
          Password
        </label>
        <input
          id="partner-password"
          type="password"
          autoComplete="current-password"
          placeholder=" "
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-[#010409] text-white font-bold text-sm py-3 disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
