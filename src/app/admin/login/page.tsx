"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // MFA step — set once /api/admin/login responds with mfaRequired,
  // mirroring AuthOptions.tsx's merchant-side handling of the same
  // two-step password -> OTP flow.
  const [mfaChallenge, setMfaChallenge] = useState<{ challengeId: string; maskedPhone: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to sign in with those credentials.");
      }

      // Checked before data.success — the mfaRequired response never
      // includes a success field at all (see /api/admin/login/route.ts),
      // so gating on data.success first would throw here on every
      // MFA-enrolled admin login, even though the code was already sent.
      if (data.mfaRequired) {
        setMfaChallenge({ challengeId: data.challengeId, maskedPhone: data.maskedPhone });
        setResendCooldown(60);
        setIsSubmitting(false);
        return;
      }

      if (!data.success) {
        throw new Error(data.error || "Unable to sign in with those credentials.");
      }

      // No MFA challenge means either mfaSetupRequired (session already
      // issued, dashboard layout's MFA gate will redirect to
      // /admin/mfa-setup) or an already-enrolled edge case — either way
      // the session cookie is set, so route into the dashboard and let
      // the layout gate decide.
      router.push("/admin");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sign in with those credentials.");
      setIsSubmitting(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/login/mfa-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: mfaChallenge.challengeId, code: mfaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");

      router.push("/admin");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Incorrect code");
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!mfaChallenge || resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [mfaChallenge, resendCooldown]);

  const handleResend = async () => {
    if (!mfaChallenge || resending || resendCooldown > 0) return;
    setResending(true);
    try {
      const res = await fetch("/api/admin/login/mfa-resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: mfaChallenge.challengeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (typeof data.retryAfterSeconds === "number") setResendCooldown(data.retryAfterSeconds);
        throw new Error(data.error || "Couldn't resend the code.");
      }
      setMfaChallenge({ challengeId: mfaChallenge.challengeId, maskedPhone: data.maskedPhone });
      setResendCooldown(data.cooldownSeconds || 60);
      toast.success("A new code is on its way.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setResending(false);
    }
  };

  if (mfaChallenge) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Enter your verification code</h1>
          <p className="text-slate-600 text-sm text-center mb-8">We texted a 6-digit code to {mfaChallenge.maskedPhone}.</p>

          <form onSubmit={handleMfaSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2">Verification Code</label>
              <input
                required
                autoFocus
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308] text-center text-lg tracking-[0.3em]"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || mfaCode.length !== 6}
              className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </button>
            <div className="text-center text-xs text-slate-500">
              Didn&apos;t receive a code?{" "}
              {resendCooldown > 0 ? (
                <span>Resend available in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="font-semibold text-blue-600 hover:underline disabled:opacity-50"
                >
                  {resending ? "Sending…" : "Resend code"}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setMfaChallenge(null);
                setMfaCode("");
                setResendCooldown(0);
              }}
              className="w-full text-xs text-slate-500 hover:text-slate-900"
            >
              Back to login
            </button>
          </form>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Admin Dashboard</h1>
        <p className="text-slate-600 text-sm text-center mb-8">Sign in with your WGC Payments admin account.</p>

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold">Password</label>
              <Link href="/admin/forgot-password" className="text-xs font-semibold text-blue-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
          </button>
        </form>
      </main>
      <Footer />
    </div>
  );
}
