"use client";

import Link from "next/link";
import { useState } from "react";

type Step = "password" | "code";

export default function PartnerLoginForm() {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; maskedEmail: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { res, data } = await post("/api/partner/login", { email, password });
      if (!res.ok) return setMessage({ text: data.error || "Login failed. Please try again.", error: true });
      if (data.mfaRequired) {
        setChallenge({ id: data.challengeId, maskedEmail: data.maskedEmail });
        setStep("code");
        return;
      }
      window.location.assign("/partner/organizations");
    } catch {
      setMessage({ text: "Login failed. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setMessage(null);
    try {
      const { res, data } = await post("/api/partner/login/verify", { challengeId: challenge.id, code });
      if (!res.ok) return setMessage({ text: data.error || "That code isn't right.", error: true });
      window.location.assign("/partner/organizations");
    } catch {
      setMessage({ text: "Something went wrong. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!challenge) return;
    setMessage(null);
    const { res, data } = await post("/api/partner/login/resend", { challengeId: challenge.id });
    setMessage(res.ok ? { text: "We sent a new code.", error: false } : { text: data.error || "Couldn't send a new code.", error: true });
  }

  if (step === "code" && challenge) {
    return (
      <form onSubmit={submitCode} className="space-y-4">
        <p className="text-sm text-slate-600">
          We emailed a 6-digit code to <strong>{challenge.maskedEmail}</strong>. It expires in 10 minutes.
        </p>
        <div>
          <label htmlFor="partner-code" className="block text-xs font-semibold text-slate-600 mb-1">
            Sign-in code
          </label>
          <input
            id="partner-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder=" "
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg tracking-[0.4em] text-center"
          />
        </div>
        {message && (
          <p role="alert" className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>
            {message.text}
          </p>
        )}
        <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-xl bg-[#010409] text-white font-bold text-sm py-3 disabled:opacity-60">
          {busy ? "Checking…" : "Verify and sign in"}
        </button>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={resend} className="font-semibold text-slate-700">
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("password");
              setChallenge(null);
              setCode("");
              setMessage(null);
            }}
            className="font-semibold text-slate-700"
          >
            Start over
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="space-y-4">
      <div>
        <label htmlFor="partner-email" className="block text-xs font-semibold text-slate-600 mb-1">
          Email
        </label>
        <input id="partner-email" type="email" autoComplete="username" placeholder=" " required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
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
      {message && (
        <p role="alert" className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#010409] text-white font-bold text-sm py-3 disabled:opacity-60">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm">
        <Link href="/partner/forgot-password" className="font-semibold text-slate-700">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
