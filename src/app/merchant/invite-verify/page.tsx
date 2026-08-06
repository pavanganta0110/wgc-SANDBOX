"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function InviteVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 6) {
      toast.error("Please enter a valid 6-digit code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/invite-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Verification failed.");
      }

      toast.success("Verification successful! Redirecting...");
      router.replace("/merchant/dashboard");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Verify your invitation</h1>
          <p className="text-slate-600 text-sm">
            Your social login email differs from the email invited. We sent a 6-digit verification code to the invited email address to verify your identity.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 mt-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">Verification Code</label>
            <input
              required
              type="text"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border outline-none text-center text-lg tracking-widest font-bold focus:ring-2 focus:ring-[#eab308]"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify and Accept Invite"}
          </button>
        </form>
      </main>
      <Footer />
    </div>
  );
}
