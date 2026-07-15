"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2 } from "lucide-react";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";
import { formatCents } from "@/lib/format";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";

type ResultState = { step: "form" } | { step: "processing" } | { step: "success"; data: any } | { step: "failed"; error: string };

export default function SetupLinkForm({
  token,
  organizationName,
  donorFirstName,
  donorLastName,
  donorEmail,
  isPaymentUpdate = false,
}: {
  token: string;
  organizationName: string;
  donorFirstName: string | null;
  donorLastName: string | null;
  donorEmail: string;
  isPaymentUpdate?: boolean;
}) {
  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [firstName, setFirstName] = useState(donorFirstName || "");
  const [lastName, setLastName] = useState(donorLastName || "");
  const [phone, setPhone] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [result, setResult] = useState<ResultState>({ step: "form" });

  useEffect(() => {
    if (!APPLICATION_ID) return;
    let cancelled = false;
    mountFinixPaymentForm("setup-link-finix-form", APPLICATION_ID, { paymentMethods: ["card", "bank"], showAddress: false })
      .then((instance) => {
        if (cancelled) return;
        formInstanceRef.current = instance;
        setFormReady(true);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load the payment form. Please refresh and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!consentAccepted) {
      toast.error("Please accept the recurring donation terms to continue");
      return;
    }
    if (!formInstanceRef.current || !formReady) {
      toast.error("Payment form is still loading — please wait a moment");
      return;
    }

    setResult({ step: "processing" });

    formInstanceRef.current.submit(async (error, response) => {
      if (error || !response?.data?.id) {
        toast.error("Could not process your payment details. Please check your card/bank info.");
        setResult({ step: "form" });
        return;
      }

      try {
        const res = await fetch(`/api/setup/${token}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finixToken: response.data.id,
            donorFirstName: firstName.trim(),
            donorLastName: lastName.trim(),
            donorPhone: phone.trim() || undefined,
            consentAccepted: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setResult({ step: "failed", error: data.error || "We couldn't set up your recurring donation." });
          return;
        }
        setResult({ step: "success", data });
      } catch {
        setResult({ step: "failed", error: "A network error occurred. Please try again." });
      }
    });
  };

  if (result.step === "success") {
    const data = result.data;
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">{isPaymentUpdate ? "Payment Method Updated" : "Recurring Donation Set Up"}</h2>
        <p className="text-sm text-slate-600 mb-4">{isPaymentUpdate ? `Your payment method for ${organizationName} has been updated.` : `Thank you for supporting ${organizationName}.`}</p>
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-left space-y-1">
          <p>Amount: <strong>{formatCents(data.amountCents)}</strong></p>
          <p>Payment Method: •••• {data.paymentMethodLastFour}</p>
          {data.nextBillingDate && <p>Next Billing Date: {new Date(data.nextBillingDate).toLocaleDateString("en-US")}</p>}
        </div>
      </div>
    );
  }

  if (result.step === "failed") {
    return (
      <div className="text-center py-6">
        <h2 className="text-lg font-bold text-red-700 mb-2">Setup Failed</h2>
        <p className="text-sm text-slate-600 mb-4">{result.error}</p>
        <button onClick={() => setResult({ step: "form" })} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
        <input placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
      </div>
      <input value={donorEmail} disabled className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-sm text-slate-500" />
      <input placeholder="Phone (Optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />

      <div id="setup-link-finix-form" className="min-h-[100px] border border-slate-200 rounded-lg p-3" />

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} className="mt-0.5" />
        I authorize {organizationName} to charge the payment method above on the recurring schedule described, and I understand I may cancel at any time by contacting the organization.
      </label>

      <button
        onClick={handleSubmit}
        disabled={result.step === "processing"}
        className="w-full px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
      >
        {result.step === "processing" ? "Submitting…" : isPaymentUpdate ? "Update Payment Method" : "Set Up Recurring Donation"}
      </button>
    </div>
  );
}
