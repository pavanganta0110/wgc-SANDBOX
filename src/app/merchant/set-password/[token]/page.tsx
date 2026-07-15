"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function SetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to set password.");
      }

      if (data.autoLoginFailed) {
        toast.success("Password set! Please log in.");
        router.push("/merchant/login");
      } else {
        toast.success("Password set! Redirecting to your dashboard...");
        router.push("/merchant/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Set your password</h1>
        <p className="text-slate-600 text-sm text-center mb-8">
          Choose a password for your WGC Payments dashboard.
        </p>

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-5">
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
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set password and log in"}
          </button>
        </form>
      </main>
      <Footer />
    </div>
  );
}
