"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Link from "next/link";

interface AuthOptionsProps {
  mode: "login" | "signup" | "invite" | "activation" | "reauth";
  redirectTo?: string;
  promotion?: string;
  inviteToken?: string;
  activationToken?: string;
  reauthType?: string;
  heading?: string;
  subheading?: string;
  emailLoginVisible?: boolean;
  emailSignupVisible?: boolean;
}

function AuthOptionsInner({
  mode,
  redirectTo,
  promotion,
  inviteToken,
  activationToken,
  reauthType,
  heading,
  subheading,
  emailLoginVisible = true,
  emailSignupVisible = false,
}: AuthOptionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [providers, setProviders] = useState({ google: false, apple: false });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [authLoading, setAuthLoading] = useState<"google" | "apple" | "email" | null>(null);

  // Email form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reauthHasPassword, setReauthHasPassword] = useState(true);

  // MFA step — set once /api/merchant/login responds with mfaRequired,
  // replacing the email/password form with a code-entry form until it's
  // verified. Applies to both a normal login and a reauth attempt (both
  // POST the same /api/merchant/login), which is intentional: a step-up
  // reauth for a sensitive action should be at least as strong as the
  // original login, not weaker.
  const [mfaChallenge, setMfaChallenge] = useState<{ challengeId: string; maskedPhone: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  // Error handling from URL
  useEffect(() => {
    const errorMsg = searchParams.get("error");
    if (errorMsg) {
      toast.error(errorMsg);
      // Remove error from URL without refresh
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }

    const linkNotice = searchParams.get("linkNotice");
    if (linkNotice) {
      const provider = searchParams.get("provider");
      toast.success(
        `An account with your email already exists. Log in with your password to link your ${provider} account.`,
        { duration: 6000 }
      );
    }
  }, [searchParams]);

  // Load configured providers
  useEffect(() => {
    async function loadConfig() {
      try {
        const isReauth = mode === "reauth" || searchParams.get("reauth") === "true";
        if (isReauth) {
          const res = await fetch("/api/merchant/settings/security/auth-accounts");
          if (res.ok) {
            const data = await res.json();
            setProviders({
              google: data.connectedProviders.includes("google"),
              apple: data.connectedProviders.includes("apple"),
            });
            setReauthHasPassword(data.hasPassword);
          }
        } else {
          const res = await fetch("/api/auth/config");
          if (res.ok) {
            const data = await res.json();
            setProviders(data);
          }
        }
      } catch (err) {
        console.error("Failed to load auth configuration", err);
      } finally {
        setLoadingConfig(false);
      }
    }
    loadConfig();
  }, [mode, searchParams]);

  const handleProviderRedirect = (provider: "google" | "apple") => {
    if (authLoading) return;
    setAuthLoading(provider);

    const queryParams = new URLSearchParams();
    queryParams.set("mode", mode);
    if (redirectTo) queryParams.set("redirectTo", redirectTo);
    if (promotion) queryParams.set("promotion", promotion);
    if (inviteToken) queryParams.set("inviteToken", inviteToken);
    if (activationToken) queryParams.set("activationToken", activationToken);
    if (reauthType) queryParams.set("reauthType", reauthType);

    router.push(`/api/auth/${provider}?${queryParams.toString()}`);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading) return;

    if (mode === "invite" && password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setAuthLoading("email");

    try {
      let res;
      if (mode === "signup") {
        // Sign up with email (not fully supported by default password flow without church/organization, but standard)
        res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } else if (mode === "invite") {
        res = await fetch("/api/merchant/set-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: inviteToken, password }),
        });
      } else {
        // standard login
        res = await fetch("/api/merchant/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      if (data.mfaRequired) {
        setMfaChallenge({ challengeId: data.challengeId, maskedPhone: data.maskedPhone });
        setResendCooldown(60);
        setAuthLoading(null);
        return;
      }

      toast.success("Success!");
      // Redirect
      const finalDest = redirectTo || "/merchant/dashboard";
      router.replace(finalDest);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
      setAuthLoading(null);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge || authLoading) return;
    setAuthLoading("email");
    try {
      const res = await fetch("/api/merchant/login/mfa-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: mfaChallenge.challengeId, code: mfaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");

      toast.success("Success!");
      const finalDest = redirectTo || "/merchant/dashboard";
      router.replace(finalDest);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Incorrect code");
      setAuthLoading(null);
    }
  };

  // Ticks the "Resend available in Ns" countdown client-side; the server
  // is the actual source of truth for the cooldown (checkOtpSendLimits),
  // this just keeps the button disabled so a resend isn't attempted (and
  // rejected with a 429) before it's likely to succeed.
  useEffect(() => {
    if (!mfaChallenge || resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [mfaChallenge, resendCooldown]);

  const handleResend = async () => {
    if (!mfaChallenge || resending || resendCooldown > 0) return;
    setResending(true);
    try {
      const res = await fetch("/api/merchant/login/mfa-resend", {
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

  if (loadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (mfaChallenge) {
    return (
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Enter your verification code</h1>
          <p className="text-slate-600 text-sm">We texted a 6-digit code to {mfaChallenge.maskedPhone}.</p>
        </div>
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
            disabled={!!authLoading || mfaCode.length !== 6}
            className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {authLoading === "email" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
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
      </div>
    );
  }

  const showSocial = providers.google || providers.apple;
  const showEmailForm = (mode === "reauth" || searchParams.get("reauth") === "true") ? reauthHasPassword : (emailLoginVisible || emailSignupVisible);

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {(heading || subheading) && (
        <div className="text-center">
          {heading && <h1 className="text-2xl font-bold text-slate-900 mb-2">{heading}</h1>}
          {subheading && <p className="text-slate-600 text-sm">{subheading}</p>}
        </div>
      )}

      {showEmailForm && (
        <form onSubmit={handleEmailSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-5">
          {mode === "invite" ? (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2">New Password</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]"
                />
                <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Confirm Password</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]"
                />
              </div>
            </>
          ) : (
            <>
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
                  {mode !== "signup" && (
                    <Link href="/merchant/forgot-password" className="text-xs font-semibold text-blue-600 hover:underline">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]"
                />
              </div>
            </>
          )}
          <button
            type="submit"
            disabled={!!authLoading}
            className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {authLoading === "email" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === "signup" ? (
              "Create account"
            ) : mode === "invite" ? (
              "Set password and log in"
            ) : (
              "Log in"
            )}
          </button>
        </form>
      )}

      {showSocial && showEmailForm && (
        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="mx-4 text-xs text-slate-400 font-semibold uppercase tracking-wider">OR CONTINUE WITH</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>
      )}

      {showSocial && (
        <div className="space-y-3">
          {providers.google && (
            <button
              onClick={() => handleProviderRedirect("google")}
              disabled={!!authLoading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 font-semibold text-slate-700 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
            >
              {authLoading === "google" ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.72 5.72 0 0 1-2.48 3.76v3.12h3.99c2.34-2.16 3.69-5.32 3.69-8.73Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.99-3.12c-1.12.75-2.54 1.19-3.97 1.19-3.05 0-5.63-2.06-6.55-4.83H1.4v3.22A12 12 0 0 0 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.45 14.33a7.14 7.14 0 0 1 0-4.66V6.45H1.4a12 12 0 0 0 0 11.1l4.05-3.22Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A12 12 0 0 0 1.4 6.45l4.05 3.22c.92-2.77 3.5-4.83 6.55-4.83Z"
                  />
                </svg>
              )}
              Continue with Google
            </button>
          )}

          {providers.apple && (
            <button
              onClick={() => handleProviderRedirect("apple")}
              disabled={!!authLoading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl bg-black hover:bg-slate-900 font-semibold text-white transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
            >
              {authLoading === "apple" ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.15.67-2.87 1.51-.62.71-1.16 1.85-1.02 2.96 1.1.09 2.2-.55 2.9-1.41Z" />
                </svg>
              )}
              Continue with Apple
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AuthOptions(props: AuthOptionsProps) {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    }>
      <AuthOptionsInner {...props} />
    </Suspense>
  );
}
