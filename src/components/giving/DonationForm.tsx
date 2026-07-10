"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getFraudSessionId } from "@/lib/finix/fraudSession";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import { calculateFeeCoveredTotal } from "@/lib/giving/feeCalculator";
import { formatCents } from "@/lib/format";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";

export default function DonationForm({
  slug,
  finixMerchantId,
  primaryColorHex,
  suggestedAmountsCents,
  allowRecurring,
  allowFeeCoverage,
  pricing,
}: {
  slug: string;
  finixMerchantId: string;
  primaryColorHex: string;
  suggestedAmountsCents: number[];
  allowRecurring: boolean;
  allowFeeCoverage: boolean;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
}) {
  const [amountCents, setAmountCents] = useState<number>(suggestedAmountsCents[0] ?? 2500);
  const [customAmount, setCustomAmount] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [interval, setInterval_] = useState<"MONTHLY" | "WEEKLY" | "YEARLY">("MONTHLY");
  const [coverFees, setCoverFees] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formReady, setFormReady] = useState(false);

  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);

  useEffect(() => {
    if (!APPLICATION_ID) return;
    let cancelled = false;

    // Finix.PaymentForm injects fields into the container without clearing
    // it first — remounting on a payment-method switch would otherwise
    // stack the new fields on top of the old ones instead of replacing them.
    const container = document.getElementById("finix-payment-form");
    if (container) container.innerHTML = "";
    formInstanceRef.current = null;
    setFormReady(false);

    mountFinixPaymentForm(
      "finix-payment-form",
      APPLICATION_ID,
      {
        paymentMethods: [paymentMethod],
        showAddress: false,
      }
    ).then((instance) => {
      if (cancelled) return;
      formInstanceRef.current = instance;
      setFormReady(true);
    }).catch(() => {
      if (!cancelled) toast.error("Could not load the payment form. Please refresh and try again.");
    });

    return () => {
      cancelled = true;
    };
  }, [paymentMethod]);

  const effectiveAmountCents = customAmount ? Math.round(parseFloat(customAmount) * 100) : amountCents;
  const projectedFee = calculateFeeCoveredTotal(effectiveAmountCents || 0, paymentMethod, pricing);
  const { totalCents, feeCoveredCents } = coverFees
    ? projectedFee
    : { totalCents: effectiveAmountCents || 0, feeCoveredCents: 0 };

  const handleSubmit = async () => {
    if (!effectiveAmountCents || effectiveAmountCents < 100) {
      toast.error("Please enter an amount of at least $1.00");
      return;
    }
    if (!name || !email) {
      toast.error("Please enter your name and email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (!(digits.length === 10 || (digits.length === 11 && digits.startsWith("1")))) {
        toast.error("Please enter a valid U.S. phone number (10 digits)");
        return;
      }
    }
    if (!formInstanceRef.current || !formReady) {
      toast.error("Payment form is still loading — please wait a moment");
      return;
    }

    setSubmitting(true);
    try {
      const fraudSessionId = await getFraudSessionId(finixMerchantId);

      // Finix never calls back if tokenization hangs (e.g. incomplete card
      // fields it doesn't otherwise flag) — this timeout guarantees the
      // button can't get stuck on "Processing..." forever.
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        toast.error("This is taking too long. Please check your card/bank details and try again.");
        setSubmitting(false);
      }, 20000);

      // Confirmed against docs.finix.com/guides/online-payments/payment-tokenization/tokenization-forms:
      // for a custom submit button, form.submit() takes only the callback —
      // no environment/applicationId arguments.
      formInstanceRef.current.submit(async (error, response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);

          if (error || !response?.data?.id) {
            toast.error("Could not process your payment details. Please check your card/bank info.");
            setSubmitting(false);
            return;
          }

          try {
            if (process.env.NODE_ENV === "development") {
              console.log("[DonationForm] Submitting donor →", { name, email, phone });
            }

            const res = await fetch(`/api/give/${slug}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: response.data.id,
                donationAmountCents: effectiveAmountCents,
                coverFees,
                isRecurring,
                billingInterval: isRecurring ? interval : undefined,
                paymentMethod,
                fraudSessionId,
                donor: { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined },
              }),
            });

            const data = await res.json();
            if (!res.ok) {
              toast.error(data?.error || "Payment failed. Please try again.");
              setSubmitting(false);
              return;
            }

            toast.success(isRecurring ? "Recurring gift set up!" : "Thank you for your gift!");
            setSubmitting(false);
          } catch {
            toast.error("Something went wrong submitting your gift. Please try again.");
            setSubmitting(false);
          }
        }
      );
    } catch {
      toast.error("Could not start a secure session. Please refresh and try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {allowRecurring && (
        <div className="flex rounded-xl border border-slate-200 p-1">
          <button
            onClick={() => setIsRecurring(false)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold ${!isRecurring ? "text-white" : "text-slate-600"}`}
            style={!isRecurring ? { backgroundColor: primaryColorHex } : undefined}
          >
            One-Time
          </button>
          <button
            onClick={() => setIsRecurring(true)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold ${isRecurring ? "text-white" : "text-slate-600"}`}
            style={isRecurring ? { backgroundColor: primaryColorHex } : undefined}
          >
            Recurring
          </button>
        </div>
      )}

      {isRecurring && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Frequency</label>
          <select
            value={interval}
            onChange={(e) => setInterval_(e.target.value as "MONTHLY" | "WEEKLY" | "YEARLY")}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2">Amount</label>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {suggestedAmountsCents.map((cents) => (
            <button
              key={cents}
              onClick={() => {
                setAmountCents(cents);
                setCustomAmount("");
              }}
              className={`py-2 rounded-lg border text-sm font-semibold ${
                !customAmount && amountCents === cents
                  ? "text-white border-transparent"
                  : "border-slate-200 text-slate-700"
              }`}
              style={!customAmount && amountCents === cents ? { backgroundColor: primaryColorHex } : undefined}
            >
              {formatCents(cents)}
            </button>
          ))}
        </div>
        <input
          type="number"
          min="1"
          step="0.01"
          placeholder="Custom amount"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2">Payment Method</label>
        <div className="flex rounded-xl border border-slate-200 p-1">
          <button
            onClick={() => setPaymentMethod("card")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold ${paymentMethod === "card" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            Card
          </button>
          <button
            onClick={() => setPaymentMethod("bank")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold ${paymentMethod === "bank" ? "bg-slate-900 text-white" : "text-slate-600"}`}
          >
            Bank Account
          </button>
        </div>
      </div>

      <div id="finix-payment-form" className="min-h-[120px]" />

      {allowFeeCoverage && effectiveAmountCents > 0 && (
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={coverFees} onChange={(e) => setCoverFees(e.target.checked)} className="mt-0.5" />
          <span>
            I'll cover the {formatCents(projectedFee.feeCoveredCents)} processing fee so my full{" "}
            {formatCents(effectiveAmountCents)} gift goes to the organization.
          </span>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
        />
      </div>
      <input
        type="tel"
        placeholder="Phone (optional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
      />

      <button
        onClick={handleSubmit}
        disabled={submitting || !formReady}
        className="w-full py-3 rounded-xl text-white font-bold disabled:opacity-50"
        style={{ backgroundColor: primaryColorHex }}
      >
        {submitting ? "Processing..." : `Give ${formatCents(totalCents)}${isRecurring ? ` / ${interval.toLowerCase()}` : ""}`}
      </button>
    </div>
  );
}
