"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdminLogoutButton from "@/components/admin/AdminLogoutButton";
import { SMS_2FA_CONSENT_TEXT } from "@/lib/auth/smsConsentText";

const inputClass = "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]";

/**
 * The mandatory-enrollment counterpart to SecuritySettingsForm.tsx's MFA
 * section — same phone -> code steps against the admin-side enroll/confirm
 * routes, but no "idle/enabled" or "disable" states, since arriving here at
 * all means enrollment isn't done yet, and it can't be skipped or canceled.
 */
export default function AdminMfaSetupForm({ email }: { email: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      toast.error("Please check the box agreeing to receive SMS verification codes.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mfa/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, smsConsent: consent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send verification code.");
      setMaskedPhone(phone);
      setCode("");
      setStep("code");
      toast.success("Code sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send verification code.");
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Incorrect code.");
      toast.success("Two-factor authentication enabled");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Set up two-factor authentication</h1>
          <p className="text-slate-600 text-sm">
            Signed in as {email}. WGC admin accounts require a text-message verification code at every login. This
            only needs to be set up once.
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          {step === "phone" && (
            <form onSubmit={sendCode} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">Mobile Phone Number</label>
                <input
                  required
                  type="tel"
                  placeholder="(555) 123-4567"
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <input
                  type="checkbox"
                  id="admin-mfa-sms-consent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <label htmlFor="admin-mfa-sms-consent" className="text-xs text-slate-600 leading-relaxed">
                  {SMS_2FA_CONSENT_TEXT}
                </label>
              </div>
              <p className="text-xs text-slate-400">
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Privacy Policy
                </a>{" "}
                ·{" "}
                <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Terms of Service
                </a>
              </p>
              <button
                type="submit"
                disabled={busy || !phone || !consent}
                className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send verification code"}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={confirmCode} className="space-y-5">
              <p className="text-sm text-slate-600">We texted a 6-digit code to {maskedPhone}.</p>
              <div>
                <label className="block text-sm font-semibold mb-2">Verification Code</label>
                <input
                  required
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className={`${inputClass} text-center text-lg tracking-[0.3em]`}
                />
              </div>
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="w-full text-xs text-slate-500 hover:text-slate-900"
              >
                Use a different number
              </button>
            </form>
          )}
        </div>

        <div className="text-center mt-6">
          <AdminLogoutButton />
        </div>
      </main>
      <Footer />
    </div>
  );
}
