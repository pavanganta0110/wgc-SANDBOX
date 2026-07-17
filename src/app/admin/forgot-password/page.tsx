"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Reset your admin password</h1>
        <p className="text-slate-600 text-sm text-center mb-8">
          Enter the email you use to sign in to the WGC Payments admin dashboard.
        </p>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          {submitted ? (
            <p className="text-sm text-slate-700 text-center">
              If an account exists for this email, password-reset instructions have been sent. The link expires in
              45 minutes.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
              </button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
