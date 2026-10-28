"use client";

import { useState } from "react";

export default function FindMyGivingForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/donor-portal/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    } finally {
      setLoading(false);
      // Same screen whether or not anything matched.
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-wgc-navy-100 bg-white p-6 text-center">
        <p className="text-base font-semibold text-wgc-navy-900">Check your inbox</p>
        <p className="mt-2 text-sm text-wgc-navy-500">If we found giving under {email}, we&rsquo;ve emailed you a link for each organization. Open one and enter the code we send.</p>
        <button type="button" onClick={() => setSent(false)} className="mt-4 text-xs font-semibold text-wgc-navy-500 underline">Use a different email</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="The email you gave with"
        aria-label="Email address"
        className="flex-1 rounded-2xl border border-wgc-navy-100 bg-white px-5 py-4 text-base text-wgc-navy-900 outline-none focus:border-wgc-gold-500"
      />
      <button type="submit" disabled={loading} className="metallic-gold rounded-2xl px-8 py-4 text-[13px] font-bold tracking-wide disabled:opacity-60">
        {loading ? "Sending…" : "Find my giving"}
      </button>
    </form>
  );
}
