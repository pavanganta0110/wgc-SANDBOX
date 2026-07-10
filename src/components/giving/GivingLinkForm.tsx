"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle, Clock, AlertCircle, Repeat } from "lucide-react";
import { getFraudSessionId } from "@/lib/finix/fraudSession";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import { calculateFeeCoveredTotal } from "@/lib/giving/feeCalculator";
import { formatCents } from "@/lib/format";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";
import type { DonorFieldSettings, FrequencyKey, PaymentMethodKey, BrandingModeSettings } from "@/lib/givingLinks/types";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";

const FREQUENCY_LABELS: Record<FrequencyKey, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every Two Weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

type ResultState =
  | { step: "form" }
  | { step: "processing" }
  | { step: "success"; totalCents: number; feeCoveredCents: number; donationAmountCents: number; transferId?: string; recurring?: boolean; frequency?: string }
  | { step: "pending"; totalCents: number; transferId?: string }
  | { step: "failed"; error: string };

export default function GivingLinkForm({
  slug,
  finixMerchantId,
  churchName,
  light,
  amountType,
  fixedAmountCents,
  minAmountCents,
  maxAmountCents,
  suggestedAmountsCents,
  allowCustomAmount,
  recurringEnabled,
  allowedFrequencies,
  allowedPaymentMethods,
  feeCoverEnabled,
  feeCoverDefaultOn,
  donorFieldSettings,
  pricing,
  thankYouMessage,
}: {
  slug: string;
  finixMerchantId: string;
  churchName: string;
  light: BrandingModeSettings;
  amountType: "FIXED" | "VARIABLE";
  fixedAmountCents: number | null;
  minAmountCents: number | null;
  maxAmountCents: number | null;
  suggestedAmountsCents: number[];
  allowCustomAmount: boolean;
  recurringEnabled: boolean;
  allowedFrequencies: FrequencyKey[];
  allowedPaymentMethods: PaymentMethodKey[];
  feeCoverEnabled: boolean;
  feeCoverDefaultOn: boolean;
  donorFieldSettings: DonorFieldSettings;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
  thankYouMessage: string;
}) {
  const [amountCents, setAmountCents] = useState<number>(fixedAmountCents ?? suggestedAmountsCents[0] ?? 2500);
  const [customAmount, setCustomAmount] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<FrequencyKey>(allowedFrequencies[0] ?? "MONTHLY");
  const [coverFees, setCoverFees] = useState(feeCoverDefaultOn);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">(
    allowedPaymentMethods.includes("CARD") ? "card" : "bank"
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [result, setResult] = useState<ResultState>({ step: "form" });

  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);
  const cardBankMethods = allowedPaymentMethods.filter((m) => m === "CARD" || m === "BANK");

  useEffect(() => {
    if (!APPLICATION_ID) return;
    let cancelled = false;

    const container = document.getElementById("giving-link-finix-form");
    if (container) container.innerHTML = "";
    formInstanceRef.current = null;
    setFormReady(false);

    mountFinixPaymentForm("giving-link-finix-form", APPLICATION_ID, {
      paymentMethods: [paymentMethod],
      showAddress: false,
    })
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
  }, [paymentMethod]);

  const effectiveAmountCents = amountType === "FIXED" ? (fixedAmountCents ?? 0) : customAmount ? Math.round(parseFloat(customAmount) * 100) : amountCents;
  const projectedFee = calculateFeeCoveredTotal(effectiveAmountCents || 0, paymentMethod, pricing);
  const { totalCents, feeCoveredCents } = coverFees ? projectedFee : { totalCents: effectiveAmountCents || 0, feeCoveredCents: 0 };

  const isFieldVisible = (key: keyof DonorFieldSettings) => donorFieldSettings[key] !== "HIDDEN";
  const isFieldRequired = (key: keyof DonorFieldSettings) => donorFieldSettings[key] === "REQUIRED";

  const handleSubmit = async () => {
    if (amountType === "VARIABLE") {
      if (minAmountCents != null && effectiveAmountCents < minAmountCents) {
        toast.error(`Please enter at least ${formatCents(minAmountCents)}`);
        return;
      }
      if (maxAmountCents != null && effectiveAmountCents > maxAmountCents) {
        toast.error(`Please enter no more than ${formatCents(maxAmountCents)}`);
        return;
      }
    }
    if (!effectiveAmountCents || effectiveAmountCents < 100) {
      toast.error("Please enter an amount of at least $1.00");
      return;
    }
    const fullName = `${firstName} ${lastName}`.trim();
    if ((isFieldRequired("firstName") || isFieldRequired("lastName")) && !fullName) {
      toast.error("Please enter your name");
      return;
    }
    if (isFieldRequired("email") && !email) {
      toast.error("Please enter your email");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!formInstanceRef.current || !formReady) {
      toast.error("Payment form is still loading — please wait a moment");
      return;
    }

    setSubmitting(true);
    setResult({ step: "processing" });

    try {
      const fraudSessionId = await getFraudSessionId(finixMerchantId);

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        toast.error("This is taking too long. Please check your card/bank details and try again.");
        setSubmitting(false);
        setResult({ step: "form" });
      }, 20000);

      formInstanceRef.current.submit(async (error, response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (error || !response?.data?.id) {
          toast.error("Could not process your payment details. Please check your card/bank info.");
          setSubmitting(false);
          setResult({ step: "form" });
          return;
        }

        try {
          const res = await fetch(`/api/g/${slug}/donate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: response.data.id,
              donationAmountCents: effectiveAmountCents,
              coverFees: feeCoverEnabled ? coverFees : false,
              isRecurring: recurringEnabled ? isRecurring : false,
              billingInterval: isRecurring ? frequency : undefined,
              paymentMethod,
              fraudSessionId,
              donor: {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                name: fullName,
                email: email.trim(),
                phone: phone.trim() || undefined,
                note: note.trim() || undefined,
                isAnonymous,
              },
            }),
          });

          const data = await res.json();
          setSubmitting(false);

          if (!res.ok) {
            setResult({ step: "failed", error: data?.error || "Payment failed. Please try again." });
            return;
          }

          if (data.recurring) {
            setResult({
              step: "success",
              totalCents: 0,
              feeCoveredCents: 0,
              donationAmountCents: effectiveAmountCents,
              recurring: true,
              frequency,
            });
            return;
          }

          const state = (data.state || "").toUpperCase();
          if (state === "PENDING") {
            setResult({ step: "pending", totalCents: data.totalCents, transferId: data.transferId });
          } else {
            setResult({
              step: "success",
              totalCents: data.totalCents,
              feeCoveredCents: data.feeCoveredCents,
              donationAmountCents: data.donationAmountCents,
              transferId: data.transferId,
            });
          }
        } catch {
          setSubmitting(false);
          setResult({ step: "failed", error: "Something went wrong submitting your gift. Please try again." });
        }
      });
    } catch {
      setSubmitting(false);
      setResult({ step: "form" });
      toast.error("Could not start a secure session. Please refresh and try again.");
    }
  };

  if (result.step === "success") {
    return (
      <div className="text-center space-y-4 py-4">
        <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
        <h2 className="text-lg font-bold" style={{ color: light.headingColor }}>
          {result.recurring ? "Recurring Giving Set Up" : "Thank You for Your Gift"}
        </h2>
        {result.recurring ? (
          <p className="text-sm" style={{ color: light.bodyTextColor }}>
            Your {FREQUENCY_LABELS[result.frequency as FrequencyKey] || "recurring"} gift of{" "}
            {formatCents(result.donationAmountCents)} to {churchName} has been scheduled.
          </p>
        ) : (
          <div className="text-sm space-y-1" style={{ color: light.bodyTextColor }}>
            <p>Donation Amount: <span className="font-semibold">{formatCents(result.donationAmountCents)}</span></p>
            {result.feeCoveredCents > 0 && (
              <p>Processing Fee Covered: <span className="font-semibold">{formatCents(result.feeCoveredCents)}</span></p>
            )}
            <p>Total Charged: <span className="font-semibold">{formatCents(result.totalCents)}</span></p>
          </div>
        )}
        {thankYouMessage && <p className="text-sm" style={{ color: light.bodyTextColor }}>{thankYouMessage}</p>}
        {result.transferId && <p className="text-xs text-slate-300 font-mono">{result.transferId}</p>}
        <button
          onClick={() => setResult({ step: "form" })}
          className="mt-2 px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: light.buttonBackground, color: light.buttonText }}
        >
          Make Another Donation
        </button>
      </div>
    );
  }

  if (result.step === "pending") {
    return (
      <div className="text-center space-y-4 py-4">
        <Clock className="w-12 h-12 mx-auto text-amber-500" />
        <h2 className="text-lg font-bold" style={{ color: light.headingColor }}>
          Donation Received — Processing
        </h2>
        <p className="text-sm" style={{ color: light.bodyTextColor }}>
          Your {formatCents(result.totalCents)} bank donation is being processed. ACH transfers can take a few
          business days to complete.
        </p>
        {result.transferId && <p className="text-xs text-slate-300 font-mono">{result.transferId}</p>}
      </div>
    );
  }

  if (result.step === "failed") {
    return (
      <div className="text-center space-y-4 py-4">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
        <h2 className="text-lg font-bold" style={{ color: light.headingColor }}>
          Donation Was Not Completed
        </h2>
        <p className="text-sm text-red-600">{result.error}</p>
        <button
          onClick={() => setResult({ step: "form" })}
          className="mt-2 px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: light.buttonBackground, color: light.buttonText }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {recurringEnabled && (
        <div className="flex rounded-xl border p-1" style={{ borderColor: light.borderColor }}>
          <button
            onClick={() => setIsRecurring(false)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold"
            style={!isRecurring ? { backgroundColor: light.buttonBackground, color: light.buttonText } : { color: light.bodyTextColor }}
          >
            One-Time
          </button>
          <button
            onClick={() => setIsRecurring(true)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1"
            style={isRecurring ? { backgroundColor: light.buttonBackground, color: light.buttonText } : { color: light.bodyTextColor }}
          >
            <Repeat className="w-3.5 h-3.5" /> Recurring
          </button>
        </div>
      )}

      {isRecurring && (
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: light.bodyTextColor }}>
            Frequency
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as FrequencyKey)}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: light.borderColor }}
          >
            {allowedFrequencies.map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-2" style={{ color: light.bodyTextColor }}>
          Amount
        </label>
        {amountType === "FIXED" ? (
          <p className="text-2xl font-bold" style={{ color: light.headingColor }}>
            {formatCents(fixedAmountCents ?? 0)}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {suggestedAmountsCents.map((cents) => (
                <button
                  key={cents}
                  onClick={() => {
                    setAmountCents(cents);
                    setCustomAmount("");
                  }}
                  className="py-2 rounded-lg border text-sm font-semibold"
                  style={
                    !customAmount && amountCents === cents
                      ? { backgroundColor: light.buttonBackground, color: light.buttonText, borderColor: light.buttonBackground }
                      : { borderColor: light.borderColor, color: light.bodyTextColor }
                  }
                >
                  {formatCents(cents)}
                </button>
              ))}
            </div>
            {allowCustomAmount && (
              <input
                type="number"
                min="1"
                step="0.01"
                placeholder="Custom amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: light.borderColor }}
              />
            )}
          </>
        )}
      </div>

      {cardBankMethods.length > 1 && (
        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: light.bodyTextColor }}>
            Payment Method
          </label>
          <div className="flex rounded-xl border p-1" style={{ borderColor: light.borderColor }}>
            {cardBankMethods.includes("CARD") && (
              <button
                onClick={() => setPaymentMethod("card")}
                className="flex-1 py-2 rounded-lg text-sm font-semibold"
                style={paymentMethod === "card" ? { backgroundColor: light.buttonBackground, color: light.buttonText } : { color: light.bodyTextColor }}
              >
                Card
              </button>
            )}
            {cardBankMethods.includes("BANK") && (
              <button
                onClick={() => setPaymentMethod("bank")}
                className="flex-1 py-2 rounded-lg text-sm font-semibold"
                style={paymentMethod === "bank" ? { backgroundColor: light.buttonBackground, color: light.buttonText } : { color: light.bodyTextColor }}
              >
                Bank Account
              </button>
            )}
          </div>
        </div>
      )}

      <div id="giving-link-finix-form" className="min-h-[120px]" />

      {feeCoverEnabled && effectiveAmountCents > 0 && (
        <label className="flex items-start gap-2 text-sm" style={{ color: light.bodyTextColor }}>
          <input type="checkbox" checked={coverFees} onChange={(e) => setCoverFees(e.target.checked)} className="mt-0.5" />
          <span>
            I&apos;ll cover the {formatCents(projectedFee.feeCoveredCents)} processing fee so my full{" "}
            {formatCents(effectiveAmountCents)} gift goes to {churchName}.
          </span>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        {isFieldVisible("firstName") && (
          <input
            placeholder={isFieldRequired("firstName") ? "First name *" : "First name"}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: light.borderColor }}
          />
        )}
        {isFieldVisible("lastName") && (
          <input
            placeholder={isFieldRequired("lastName") ? "Last name *" : "Last name"}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: light.borderColor }}
          />
        )}
      </div>
      {isFieldVisible("email") && (
        <input
          type="email"
          placeholder={isFieldRequired("email") ? "Email *" : "Email"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: light.borderColor }}
        />
      )}
      {isFieldVisible("phone") && (
        <input
          type="tel"
          placeholder={isFieldRequired("phone") ? "Phone *" : "Phone (optional)"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: light.borderColor }}
        />
      )}
      {isFieldVisible("donorNote") && (
        <input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: light.borderColor }}
        />
      )}
      {isFieldVisible("anonymousDonation") && (
        <label className="flex items-center gap-2 text-sm" style={{ color: light.bodyTextColor }}>
          <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
          Give anonymously
        </label>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !formReady}
        className="w-full py-3 rounded-xl font-bold disabled:opacity-50"
        style={{ backgroundColor: light.buttonBackground, color: light.buttonText }}
      >
        {submitting ? "Processing donation…" : `Give ${effectiveAmountCents ? formatCents(totalCents) : ""}${isRecurring ? ` / ${frequency.toLowerCase()}` : ""}`}
      </button>
    </div>
  );
}
