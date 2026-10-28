"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";

type Step = { name: "form" } | { name: "saving" } | { name: "done"; brand: string | null; last4: string | null } | { name: "error"; message: string };

/** Card entry runs entirely inside Finix.js's hosted iframe; this page only ever receives an opaque token. */
export default function DonorCardUpdateForm({ slug, subscriptionId, organizationName }: { slug: string; subscriptionId: string; organizationName: string }) {
  const formRef = useRef<FinixPaymentFormInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<Step>({ name: "form" });
  // One key per page load: a double-click or retry of the same submission can never apply twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!APPLICATION_ID) return;
    let cancelled = false;
    mountFinixPaymentForm("donor-card-finix-form", APPLICATION_ID, { paymentMethods: ["card"], showAddress: false })
      .then((instance) => {
        if (cancelled) return;
        formRef.current = instance;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setStep({ name: "error", message: "Could not load the card form. Please refresh and try again." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = () => {
    if (!formRef.current || !ready) return;
    setStep({ name: "saving" });
    formRef.current.submit(async (error, response) => {
      if (error || !response?.data?.id) {
        setStep({ name: "error", message: "We couldn't read those card details. Please check them and try again." });
        return;
      }
      try {
        const res = await fetch(`/api/donor-portal/subscriptions/${subscriptionId}/update-card`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, idempotencyKey, finixToken: response.data.id, consentConfirmed: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStep({ name: "error", message: data.error ?? "Something went wrong. Please try again." });
          return;
        }
        setStep({ name: "done", brand: data.subscription?.brand ?? null, last4: data.subscription?.last4 ?? null });
      } catch {
        setStep({ name: "error", message: "A network error occurred. Please try again." });
      }
    });
  };

  if (step.name === "done") {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
        <h2 className="mb-1 text-lg font-bold text-slate-900">Card updated</h2>
        <p className="mb-4 text-sm text-slate-600">
          Your recurring gift to {organizationName} will now use {step.brand ? `${step.brand} ` : "your new card "}
          {step.last4 ? `ending in ${step.last4}` : ""}. Your schedule and next gift date haven&rsquo;t changed.
        </p>
        <a href={`/give/${slug}/account`} className="inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back to my giving</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div id="donor-card-finix-form" className="min-h-[100px] rounded-lg border border-slate-200 p-3" />
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        I authorize {organizationName} to charge this card for my recurring gift on its current schedule. I can change or cancel it at any time.
      </label>
      {step.name === "error" && <p className="text-sm text-red-600">{step.message}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!ready || !consent || step.name === "saving"}
        className="w-full rounded-xl bg-[var(--portal-accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {step.name === "saving" ? "Saving…" : "Save new card"}
      </button>
      <a href={`/give/${slug}/account`} className="block text-center text-xs text-slate-500 hover:text-slate-700">Cancel</a>
    </div>
  );
}
