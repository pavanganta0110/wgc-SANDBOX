"use client";

import { useState } from "react";

type Reply = { ok?: boolean; next?: string; error?: string };

const input = "w-full px-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-[#eab308]";
const button = "w-full metallic-gold px-6 py-3 text-sm font-bold rounded-xl shadow-lg text-slate-900 disabled:opacity-60";

/** The sign-in shown inside a partner's frame (embedSignInMode EMAIL_CODE): type your email, then the code WGC emails you. */
export default function EmbedEmailCodeSignIn({ link }: { link: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: Record<string, string>): Promise<Reply | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Reply;
      if (!res.ok || !data.ok) setError(data.error ?? "Something went wrong. Try again.");
      return res.ok && data.ok ? data : null;
    } catch {
      setError("Could not reach WGC Payments. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (await post("/partner-embed/email-code/send", { link, email })) setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const data = await post("/partner-embed/email-code/verify", { link, email, code });
    if (data) window.location.assign(data.next ?? "/merchant/dashboard");
    else setCode("");
  }

  return (
    <main className="max-w-md w-full mx-auto px-6 py-14">
      <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Sign in to WGC Payments</h1>
      <p className="text-slate-600 text-center mb-8">{sent ? "We emailed you a 6-digit code. Enter it below." : "Enter your email and we will send you a code."}</p>
      <form onSubmit={sent ? verify : sendCode} className="space-y-4">
        <div>
          <label htmlFor="embed-email" className="block text-sm font-semibold text-slate-800 mb-1.5">
            Email
          </label>
          <input id="embed-email" type="email" required autoComplete="username" value={email} disabled={sent} onChange={(e) => setEmail(e.target.value)} className={input} />
        </div>
        {sent && (
          <div>
            <label htmlFor="embed-code" className="block text-sm font-semibold text-slate-800 mb-1.5">
              Code
            </label>
            <input id="embed-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} className={`${input} text-center text-2xl tracking-widest`} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={button}>
          {busy ? "Please wait…" : sent ? "Sign in" : "Email me a code"}
        </button>
        {sent && (
          <p className="text-center text-sm text-slate-600">
            <button type="button" className="underline" onClick={() => void sendCode()}>
              Send a new code
            </button>{" "}
            or{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setSent(false);
                setCode("");
                setError(null);
              }}
            >
              use a different email
            </button>
          </p>
        )}
      </form>
    </main>
  );
}
