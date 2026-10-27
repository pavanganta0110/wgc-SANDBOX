"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DonorPortalLoginForm({ slug, linkError }: { slug: string; linkError?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"EMAIL" | "CODE">("EMAIL");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "That sign-in link is invalid or has expired. Request a new code." : null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/donor-portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email }),
      });
    } finally {
      setLoading(false);
      // Same screen whether or not the email matched — never reveal who has given here.
      setStep("CODE");
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/donor-portal/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        router.refresh();
        return;
      }
      setError(data.error ?? "That code is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";
  const buttonClass = "w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50";

  if (step === "CODE") {
    return (
      <form onSubmit={verifyCode} className="space-y-3">
        <p className="text-sm text-slate-600 text-center">
          If we found giving under that email, we&rsquo;ve sent a 6-digit code. Enter it below.
        </p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className={`${inputClass} text-center tracking-[0.4em] text-lg`}
        />
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button type="submit" disabled={loading || code.length !== 6} className={buttonClass}>
          {loading ? "Checking…" : "Sign In"}
        </button>
        <button type="button" onClick={() => { setStep("EMAIL"); setCode(""); setError(null); }} className="w-full text-xs text-slate-500 hover:text-slate-700">
          Use a different email or send a new code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="space-y-3">
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      <button type="submit" disabled={loading} className={buttonClass}>
        {loading ? "Sending…" : "Email Me a Sign-In Code"}
      </button>
    </form>
  );
}
