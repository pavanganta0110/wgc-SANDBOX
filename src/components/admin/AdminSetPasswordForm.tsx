"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

export default function AdminSetPasswordForm({ mode }: { mode: "reset" | "invite" }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenState, setTokenState] = useState<"validating" | "valid" | "invalid">("validating");

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }
    async function validateToken() {
      try {
        const res = await fetch("/api/merchant/validate-reset-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        setTokenState(res.ok ? "valid" : "invalid");
      } catch {
        setTokenState("invalid");
      }
    }
    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/merchant/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to set password.");

      if (data.autoLoginFailed) {
        toast.success(mode === "invite" ? "Account created! Please sign in." : "Password set! Please sign in.");
        router.push("/admin/login");
      } else {
        toast.success(mode === "invite" ? "Welcome to the admin dashboard!" : "Password set! Redirecting…");
        router.push("/admin");
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
      setIsSubmitting(false);
    }
  };

  if (tokenState === "validating") {
    return (
      <div className="flex flex-col items-center gap-4 text-slate-500 py-8">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Verifying your link…</p>
      </div>
    );
  }

  if (tokenState === "invalid") {
    return (
      <div className="text-center space-y-4 py-8">
        <h2 className="text-xl font-bold text-slate-900">Link expired</h2>
        <p className="text-slate-600 text-sm">
          This link is invalid or has expired. {mode === "invite" ? "Ask your admin to resend the invitation." : "Request a new reset link."}
        </p>
        {mode === "reset" && (
          <a
            href="/admin/forgot-password"
            className="inline-block mt-2 px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all"
          >
            Request a new link
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold mb-2">{mode === "invite" ? "Create a password" : "New password"}</label>
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
        <label className="block text-sm font-semibold mb-2">Confirm password</label>
        <input
          required
          type="password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-[#eab308]"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "invite" ? "Create account" : "Set password and sign in"}
      </button>
    </form>
  );
}
