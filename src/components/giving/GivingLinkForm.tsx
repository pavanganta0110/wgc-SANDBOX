"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle, Clock, AlertCircle, Repeat } from "lucide-react";
import { getFraudSessionId } from "@/lib/finix/fraudSession";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import { calculateWgcFeeAmounts } from "@/lib/giving/feeCalculator";
import { formatCents } from "@/lib/format";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";
import type { DonorFieldSettings, FrequencyKey, PaymentMethodKey, BrandingModeSettings } from "@/lib/givingLinks/types";
import { isApplePayAvailable, loadApplePayButtonScript, beginApplePaySession, type ApplePayResult } from "@/lib/finix/wallets/applePay";
import { isGooglePayAvailable, createGooglePayButton, requestGooglePayment, type GooglePayResult } from "@/lib/finix/wallets/googlePay";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";
const APPLE_PAY_ENABLED = Boolean(process.env.NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID);

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
  googlePayGatewayMerchantId,
  googlePayMerchantId,
  googlePayEnvironment,
  previewMode = false,
  serverAvailability,
  onFormError,
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
  /** Finix Application Owner Identity ID ("ID..."), used as Google Pay's gatewayMerchantId. Null when not configured. */
  googlePayGatewayMerchantId: string | null;
  googlePayMerchantId: string | null;
  googlePayEnvironment: "TEST" | "PRODUCTION";
  /** Preview-only: renders the identical form but never creates a real payment instrument, fraud session, donation, or wallet charge. */
  previewMode?: boolean;
  /** Shared server-side availability result (getPaymentMethodAvailability) — gates wallet visibility alongside the real device capability check, so this page, the preview, and Settings never disagree. */
  serverAvailability?: { APPLE_PAY?: { enabledForOrganization: boolean }; GOOGLE_PAY?: { enabledForOrganization: boolean } };
  /** Called when the secure payment form fails to load, so a preview wrapper can show a visible retry state instead of leaving an empty area. */
  onFormError?: () => void;
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

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [walletProcessing, setWalletProcessing] = useState<"apple_pay" | "google_pay" | null>(null);
  const googlePayButtonRef = useRef<HTMLDivElement>(null);

  // Apple Pay / Google Pay always ride card-network rails, so their fee
  // uses the card rate regardless of which manual-entry tab (card/bank)
  // happens to be selected — kept separate from the card/bank form's own
  // paymentMethod-driven totalCents/feeCoveredCents declared further below.
  const effectiveAmountCents = amountType === "FIXED" ? (fixedAmountCents ?? 0) : customAmount ? Math.round(parseFloat(customAmount) * 100) : amountCents;
  
  const walletFeeResult = calculateWgcFeeAmounts({
    donationAmountCents: effectiveAmountCents || 0,
    paymentMethod: "CARD",
    cardBrand: null,
    donorCoversFee: feeCoverEnabled ? coverFees : false,
  });
  const walletTotalCents = (feeCoverEnabled && coverFees) ? walletFeeResult.amountToChargeCents : (effectiveAmountCents || 0);

  const submitWalletPayment = async (
    method: "apple_pay" | "google_pay",
    walletResult: ApplePayResult | GooglePayResult
  ): Promise<{ success: boolean }> => {
    try {
      const fraudSessionId = await getFraudSessionId(finixMerchantId);
      const res = await fetch(`/api/g/${slug}/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: method,
          walletToken: walletResult.walletToken,
          walletBillingContact: walletResult.billingContact,
          donationAmountCents: effectiveAmountCents,
          coverFees: feeCoverEnabled ? coverFees : false,
          isRecurring: false,
          fraudSessionId,
          donor: {
            name: walletResult.billingContact.name,
            email: walletResult.billingContact.email || email.trim(),
            phone: phone.trim() || undefined,
            note: note.trim() || undefined,
            isAnonymous,
          },
        }),
      });
      const data = await res.json();
      setWalletProcessing(null);

      if (!res.ok) {
        setResult({ step: "failed", error: data?.error || "Payment failed. Please try again." });
        return { success: false };
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
      return { success: true };
    } catch {
      setWalletProcessing(null);
      setResult({ step: "failed", error: "Something went wrong submitting your gift. Please try again." });
      return { success: false };
    }
  };

  const handleApplePayClick = () => {
    if (previewMode) {
      toast("This is a preview — no real payment session is started.");
      return;
    }
    if (effectiveAmountCents < 100) {
      toast.error("Please enter an amount of at least $1.00");
      return;
    }
    setWalletProcessing("apple_pay");
    beginApplePaySession({
      amountCents: walletTotalCents,
      totalLabel: churchName,
      onValidateMerchant: async (validationURL) => {
        const res = await fetch("/api/wallet/apple-pay/validate-merchant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ validationURL }),
        });
        if (!res.ok) throw new Error("Merchant validation failed");
        const data = await res.json();
        return data.merchantSession;
      },
      onAuthorized: (walletResult) => submitWalletPayment("apple_pay", walletResult),
      onCancel: () => setWalletProcessing(null),
    });
  };

  const handleGooglePayClickRef = useRef<() => void>(() => {});
  handleGooglePayClickRef.current = async () => {
    if (previewMode) {
      toast("This is a preview — no real payment session is started.");
      return;
    }
    if (effectiveAmountCents < 100) {
      toast.error("Please enter an amount of at least $1.00");
      return;
    }
    if (!googlePayGatewayMerchantId) return;
    setWalletProcessing("google_pay");
    try {
      const walletResult = await requestGooglePayment(
        {
          environment: googlePayEnvironment,
          gatewayMerchantId: googlePayGatewayMerchantId,
          merchantId: googlePayMerchantId || undefined,
          merchantName: churchName,
        },
        walletTotalCents
      );
      await submitWalletPayment("google_pay", walletResult);
    } catch {
      // Donor closed the Google Pay sheet or it failed before authorization —
      // not an error state, just return to the form.
      setWalletProcessing(null);
    }
  };

  useEffect(() => {
    if (!APPLE_PAY_ENABLED || !allowedPaymentMethods.includes("APPLE_PAY")) return;
    if (serverAvailability?.APPLE_PAY && !serverAvailability.APPLE_PAY.enabledForOrganization) return;
    if (!isApplePayAvailable()) return;
    setAppleAvailable(true);
    loadApplePayButtonScript().catch(() => {});
  }, [allowedPaymentMethods, serverAvailability]);

  useEffect(() => {
    if (!googlePayGatewayMerchantId || !allowedPaymentMethods.includes("GOOGLE_PAY")) return;
    if (serverAvailability?.GOOGLE_PAY && !serverAvailability.GOOGLE_PAY.enabledForOrganization) return;
    let cancelled = false;
    const config = {
      environment: googlePayEnvironment,
      gatewayMerchantId: googlePayGatewayMerchantId,
      merchantId: googlePayMerchantId || undefined,
      merchantName: churchName,
    };
    isGooglePayAvailable(config)
      .then((available) => {
        if (cancelled || !available) return;
        setGoogleAvailable(true);
        return createGooglePayButton(config, () => handleGooglePayClickRef.current());
      })
      .then((button) => {
        if (cancelled || !button || !googlePayButtonRef.current) return;
        googlePayButtonRef.current.innerHTML = "";
        googlePayButtonRef.current.appendChild(button);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googlePayGatewayMerchantId, googlePayEnvironment, googlePayMerchantId, allowedPaymentMethods]);

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
        if (cancelled) return;
        toast.error("Could not load the payment form. Please refresh and try again.");
        onFormError?.();
      });

    return () => {
      cancelled = true;
    };
  }, [paymentMethod]);

  const feeResult = calculateWgcFeeAmounts({
    donationAmountCents: effectiveAmountCents || 0,
    paymentMethod: paymentMethod === "bank" ? "ACH" : "CARD",
    cardBrand: null,
    donorCoversFee: feeCoverEnabled ? coverFees : false,
  });
  
  const donorCoveredFeeResult = calculateWgcFeeAmounts({
    donationAmountCents: effectiveAmountCents || 0,
    paymentMethod: paymentMethod === "bank" ? "ACH" : "CARD",
    cardBrand: null,
    donorCoversFee: true,
  });
  
  const totalCents = (feeCoverEnabled && coverFees) ? feeResult.amountToChargeCents : (effectiveAmountCents || 0);
  const feeCoveredCents = donorCoveredFeeResult.supplementalFeeCents;

  const isFieldVisible = (key: keyof DonorFieldSettings) => donorFieldSettings[key] !== "HIDDEN";
  const isFieldRequired = (key: keyof DonorFieldSettings) => donorFieldSettings[key] === "REQUIRED";

  const handleSubmit = async () => {
    if (previewMode) {
      toast("This is a preview — no real donation is submitted.");
      return;
    }
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

          const data = await res.json().catch(() => null);
          setSubmitting(false);

          if (!res.ok || !data?.success) {
            setResult({ step: "failed", error: data?.message || data?.error || "Payment failed. Please try again." });
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

      {!isRecurring && (appleAvailable || googleAvailable) && (
        <div className="space-y-2">
          {appleAvailable && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Donate with Apple Pay"
              onClick={() => walletProcessing === null && handleApplePayClick()}
              onKeyDown={(e) => e.key === "Enter" && walletProcessing === null && handleApplePayClick()}
              className={walletProcessing !== null ? "opacity-50 pointer-events-none" : "cursor-pointer"}
            >
              {/* Apple's official button web component — never hand-styled, per Apple's HIG. */}
              {/* @ts-expect-error -- custom element from Apple's Apple Pay button SDK */}
              <apple-pay-button
                buttonstyle={light.buttonBackground === "#000000" ? "white" : "black"}
                type="donate"
                locale="en-US"
                style={{ width: "100%", height: "44px", display: "block" }}
              />
              {walletProcessing === "apple_pay" && (
                <p className="text-xs text-center mt-1" style={{ color: light.bodyTextColor }}>Processing donation…</p>
              )}
            </div>
          )}
          {googleAvailable && (
            <div>
              <div ref={googlePayButtonRef} className={walletProcessing === "google_pay" ? "opacity-50 pointer-events-none" : ""} />
              {walletProcessing === "google_pay" && (
                <p className="text-xs text-center mt-1" style={{ color: light.bodyTextColor }}>Processing donation…</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs" style={{ color: light.bodyTextColor }}>
            <div className="flex-1 h-px" style={{ backgroundColor: light.borderColor }} />
            <span>or pay with card / bank</span>
            <div className="flex-1 h-px" style={{ backgroundColor: light.borderColor }} />
          </div>
        </div>
      )}

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
            I&apos;ll cover the {formatCents(feeCoveredCents)} processing fee so my full{" "}
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
