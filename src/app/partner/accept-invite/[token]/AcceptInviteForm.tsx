"use client";

import { useState } from "react";

export default function AcceptInviteForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      window.location.assign("/partner/organizations");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="new-password" className="block text-xs font-semibold text-slate-600 mb-1">
          Password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          placeholder=" "
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-600 mb-1">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          placeholder=" "
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
        {busy ? "Saving…" : "Save password and continue"}
      </button>
    </form>
  );
}
