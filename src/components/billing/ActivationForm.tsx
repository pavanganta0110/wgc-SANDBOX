"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";
import { formatCents } from "@/lib/format";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";

function estimatedFirstChargeDate(durationMonths: number | null, durationDays: number | null): Date {
  const d = new Date();
  if (durationDays != null) {
    d.setDate(d.getDate() + durationDays);
  } else {
    d.setMonth(d.getMonth() + (durationMonths ?? 0));
  }
  return d;
}

export default function ActivationForm({
  token,
  organizationName,
  isPromotional,
  durationMonths,
  durationDays,
  regularMonthlyAmountCents,
}: {
  token: string;
  organizationName: string;
  isPromotional: boolean;
  durationMonths: number | null;
  durationDays: number | null;
  regularMonthlyAmountCents: number;
}) {
  const router = useRouter();
  const [formReady, setFormReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethodType, setPaymentMethodType] = useState<"card" | "bank">("card");
  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);

  useEffect(() => {
    if (!APPLICATION_ID) return;
    let cancelled = false;
    mountFinixPaymentForm("wgc-billing-finix-form", APPLICATION_ID, { paymentMethods: [paymentMethodType], showAddress: false })
      .then((instance) => {
        if (cancelled) return;
        formInstanceRef.current = instance;
        setFormReady(true);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load the secure billing form. Please refresh and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [paymentMethodType]);

  const submit = () => {
    if (!authorized) {
      toast.error("You must authorize the subscription before continuing.");
      return;
    }
    if (!formInstanceRef.current || !formReady) {
      toast.error("The secure billing form is still loading — please wait a moment.");
      return;
    }
    setSubmitting(true);
    formInstanceRef.current.submit(async (error, response) => {
      if (error || !response?.data?.id) {
        toast.error("Could not process those billing details. Please check them and try again.");
        setSubmitting(false);
        return;
      }
      try {
        const res = await fetch("/api/billing/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            financeInstrumentToken: response.data.id,
            paymentMethodType,
            authorizationAccepted: true,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not activate your subscription.");
        toast.success("Your WGC Platform subscription is now active.");
        router.push("/merchant/subscription");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not activate your subscription. Please try again.");
      } finally {
        setSubmitting(false);
      }
    });
  };

  const estimatedFirstCharge = estimatedFirstChargeDate(isPromotional ? durationMonths : 0, isPromotional ? durationDays : null);
  const durationLabel = durationDays != null ? `${durationDays} days` : `${durationMonths} months`;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex flex-col items-center justify-center">
      <div className="mb-6 flex justify-center">
        <img src="/wgc-logo.png" alt="WGC Payments Logo" className="h-12 object-contain" />
      </div>
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Activate your WGC Platform subscription</h1>
        <p className="text-sm text-slate-500 mb-6">{organizationName}</p>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mb-6 text-sm space-y-1.5">
          {isPromotional ? (
            <>
              <p>
                <span className="font-semibold">Promotional price:</span> $0/month for the first {durationLabel}
              </p>
              <p>
                <span className="font-semibold">Regular price afterward:</span> {formatCents(regularMonthlyAmountCents)}/month
              </p>
            </>
          ) : (
            <p>
              <span className="font-semibold">Price:</span> {formatCents(regularMonthlyAmountCents)}/month
            </p>
          )}
          <p>
            <span className="font-semibold">Billing:</span> Automatically renews monthly until canceled
          </p>
          <p>
            <span className="font-semibold">First charge (estimated):</span> {estimatedFirstCharge.toLocaleDateString()} — the exact date will
            be confirmed once your subscription is created.
          </p>
          <p className="text-xs text-slate-400 pt-1">
            Standard card, ACH, refund, dispute, and other applicable processing fees continue to apply.
          </p>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethodType("card")}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${paymentMethodType === "card" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Card
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethodType("bank")}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${paymentMethodType === "bank" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Bank Account
          </button>
        </div>

        <div id="wgc-billing-finix-form" className="mb-6 min-h-[120px]" />

        <label className="flex items-start gap-2 text-xs text-slate-600 mb-6">
          <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-0.5" />
          <span>
            I authorize WGC Payments to use my selected billing method for the WGC Platform subscription.
            {isPromotional
              ? ` My platform fee will be $0 for the first ${durationLabel}. After the promotional period, `
              : " "}
            I authorize WGC Payments to charge {formatCents(regularMonthlyAmountCents)} per month until I cancel.
          </span>
        </label>

        <button
          onClick={submit}
          disabled={submitting || !authorized}
          className="w-full py-3 rounded-full bg-slate-900 text-white font-semibold disabled:opacity-50"
        >
          {submitting ? "Activating…" : "Activate Subscription"}
        </button>

        <div className="flex items-center justify-center gap-4 mt-6 text-xs text-slate-400">
          <a href="/legal/subscription-terms" className="hover:underline">Subscription Terms</a>
          <a href="/legal/privacy" className="hover:underline">Privacy Policy</a>
          <a href="/legal/cancellation" className="hover:underline">Cancellation Procedure</a>
          <a href="mailto:support@wgcpayments.com" className="hover:underline">Support</a>
        </div>
      </div>
    </div>
  );
}
