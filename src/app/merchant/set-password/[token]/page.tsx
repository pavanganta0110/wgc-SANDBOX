"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AuthOptions from "@/components/auth/AuthOptions";

export default function SetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  // Validate the token on page load so we can show a proper error state
  // instead of waiting until the user submits the form.
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
        if (res.ok) {
          setTokenState("valid");
        } else {
          setTokenState("invalid");
        }
      } catch {
        setTokenState("invalid");
      }
    }

    validateToken();
  }, [token]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">

        {tokenState === "validating" && (
          <div className="flex flex-col items-center gap-4 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Verifying your reset link…</p>
          </div>
        )}

        {tokenState === "invalid" && (
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold text-slate-900">Link expired</h1>
            <p className="text-slate-600 text-sm">
              This link is invalid or has expired. Contact WGC Payments Support for a new one.
            </p>
            <a
              href="/merchant/forgot-password"
              className="inline-block mt-4 px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg transition-all"
            >
              Request a new link
            </a>
          </div>
        )}

        {tokenState === "valid" && (
          <AuthOptions
            mode="invite"
            inviteToken={token}
            emailLoginVisible={true}
            emailSignupVisible={false}
          />
        )}

      </main>
      <Footer />
    </div>
  );
}

