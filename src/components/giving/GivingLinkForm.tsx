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
// This holds the Finix Identity ID (starts "ID...") that Apple Pay's
// merchant validation is actually performed against server-side — see
// FINIX_APPLICATION_OWNER_ID in validate-merchant/route.ts, which must
// match this value. It is NOT an Apple-issued "merchant.com.xxx" merchant
// ID; despite the older env var's name, Finix's own Apple Pay integration
// never uses one — merchant identification happens via Finix's Identity +
// domain verification, not a client-side Apple merchantIdentifier field.
// Renamed for clarity; NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID is read as a
// fallback so existing Vercel env config keeps working during rollover.
const APPLE_PAY_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_FINIX_APPLE_PAY_MERCHANT_IDENTIFIER || process.env.NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID
);

// Sandbox-only diagnostic logging for wallet button render decisions — both
// effects below bail out silently (by design, so a donor never sees a
// half-broken button), which made the original "buttons just don't show up"
// report impossible to diagnose from the browser alone. Never logs when
// NEXT_PUBLIC_FINIX_ENV is "live".
const WALLET_DEBUG = typeof window !== "undefined" && process.env.NEXT_PUBLIC_FINIX_ENV !== "live";
function walletLog(...args: unknown[]) {
  if (WALLET_DEBUG) console.log("[Wallets:sandbox]", ...args);
}

const FREQUENCY_LABELS: Record<FrequencyKey, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every Two Weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

export type ResultState =
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
  onResult,
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
  /** Called on every result-state change (form/processing/success/pending/failed) — additive, optional, used by the embed bridge to relay a safe confirmation over postMessage without this component needing any embed-specific logic. */
  onResult?: (result: ResultState) => void;
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

  useEffect(() => {
    onResult?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);
  const cardBankMethods = allowedPaymentMethods.filter((m) => m === "CARD" || m === "BANK");

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [walletProcessing, setWalletProcessing] = useState<"apple_pay" | "google_pay" | null>(null);
  const googlePayButtonRef = useRef<HTMLDivElement>(null);
  const applePayButtonRef = useRef<HTMLElement>(null);
  const [attemptId, setAttemptId] = useState("");

  // Donor Information now sits above the wallet buttons (Apple Pay/Google
  // Pay) so a donor can't reach a wallet sheet without WGC first having
  // their name/email/phone — Apple/Google's own wallet flow only ever
  // returns a billing name/email (sometimes not even that), never a phone
  // number, so without this the phone field could never be collected for
  // a wallet donation at all.
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const isValidEmailFormat = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const phoneDigitCount = (value: string) => value.replace(/\D/g, "").length;

  const donorInfoValid = Boolean(
    firstName.trim() && lastName.trim() && isValidEmailFormat(email) && phoneDigitCount(phone) >= 10
  );

  function focusFirstMissingDonorField() {
    if (!firstName.trim()) {
      firstNameRef.current?.focus();
      firstNameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!lastName.trim()) {
      lastNameRef.current?.focus();
      lastNameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!isValidEmailFormat(email)) {
      emailRef.current?.focus();
      emailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (phoneDigitCount(phone) < 10) {
      phoneRef.current?.focus();
      phoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  useEffect(() => {
    setAttemptId(crypto.randomUUID());
  }, []);

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
      walletLog(`${method}: requesting fraud session for merchant`, finixMerchantId);
      // getFraudSessionId has no internal timeout — on a slow mobile
      // connection (or if cdn.sift.com is blocked/slow) it can hang
      // indefinitely with the wallet sheet stuck open and nothing ever
      // reaching /donate, no error to debug from. Race it against a
      // timeout so a stall becomes a visible, retryable failure instead.
      const fraudSessionId = await Promise.race([
        getFraudSessionId(finixMerchantId),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Fraud session request timed out after 10s")), 10000)),
      ]);
      walletLog(`${method}: fraud session obtained, submitting donation`);
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
          clientAttemptId: attemptId,
          // Donor Information is now required and collected before any
          // wallet button is reachable (see donorInfoValid gating below),
          // so the entered fields — not the wallet's own billing contact,
          // which never includes a phone number and sometimes omits name/
          // email — are the source of truth here, matching exactly what
          // the card/bank submit path below sends.
          donor: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            name: `${firstName} ${lastName}`.trim() || walletResult.billingContact.name,
            email: email.trim() || walletResult.billingContact.email,
            phone: phone.trim() || undefined,
            note: note.trim() || undefined,
            isAnonymous,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      walletLog(`${method}: /donate response`, { status: res.status, ok: res.ok, success: data?.success, code: data?.code });

      if (!res.ok || !data?.success) {
        setWalletProcessing(null);
        const errMsg = data?.message || (typeof data?.error === 'string' ? data.error : data?.error?.message) || "We couldn’t complete your donation. Please try again.";
        setResult({ step: "failed", error: errMsg });
        return { success: false };
      }

      if (!data.transferId && !data.redirectUrl) {
        setWalletProcessing(null);
        setResult({ step: "failed", error: "Your payment response could not be confirmed. Please do not submit again." });
        return { success: false };
      }

      setWalletProcessing(null);
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
    } catch (err) {
      // Previously a bare `catch {}` — swallowed the real error (e.g. a
      // fraud-session timeout, network failure, or thrown exception)
      // completely, with nothing to debug from. The donor-facing message
      // stays generic; this is only visible in sandbox.
      walletLog(`${method}: submitWalletPayment threw`, err);
      setWalletProcessing(null);
      setResult({ step: "failed", error: "Something went wrong submitting your gift. Please try again." });
      return { success: false };
    }
  };

  // Stored in a ref (mirrors handleGooglePayClickRef below) because the
  // click is bound via a native addEventListener in the effect further
  // down, not React's onClick — a plain function reference captured once
  // in that effect would close over stale state (walletProcessing,
  // effectiveAmountCents, etc. at mount time). The ref is reassigned every
  // render so the native listener always calls the current version.
  const handleApplePayClickRef = useRef<() => void>(() => {});
  handleApplePayClickRef.current = () => {
    walletLog("Apple Pay button clicked");
    if (previewMode) {
      toast("This is a preview — no real payment session is started.");
      return;
    }
    if (!donorInfoValid) {
      toast.error("Enter your name, email, and phone number to continue.");
      focusFirstMissingDonorField();
      return;
    }
    if (effectiveAmountCents < 100) {
      toast.error("Please enter an amount of at least $1.00");
      return;
    }
    if (walletProcessing !== null) return;
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
      onCancel: () => {
        walletLog("Apple Pay: session cancelled");
        setWalletProcessing(null);
      },
    });
  };

  // Apple's official <apple-pay-button> custom element (rendered via
  // Apple's own apple-pay-sdk.js, styled with the -apple-pay-button CSS
  // appearance per Apple's HIG — never hand-rolled) does not reliably
  // deliver its click through React's synthetic event system when wrapped
  // in a plain onClick handler on an ancestor element; in practice the
  // wrapping div's onClick never fired in Safari. Binding a real, native
  // addEventListener directly to the custom element itself is the
  // documented-safe approach and bypasses React's event delegation
  // entirely, so it works regardless of how this particular Shadow-DOM
  // element dispatches its click.
  useEffect(() => {
    if (!appleAvailable) return;
    const el = applePayButtonRef.current;
    if (!el) return;
    const onClick = () => handleApplePayClickRef.current();
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [appleAvailable]);

  const handleGooglePayClickRef = useRef<() => void>(() => {});
  handleGooglePayClickRef.current = async () => {
    walletLog("Google Pay button clicked");
    if (previewMode) {
      toast("This is a preview — no real payment session is started.");
      return;
    }
    if (!donorInfoValid) {
      toast.error("Enter your name, email, and phone number to continue.");
      focusFirstMissingDonorField();
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
    } catch (err) {
      // Donor closed the Google Pay sheet or it failed before authorization —
      // not an error state shown to the donor, just return to the form.
      walletLog("Google Pay: loadPaymentData did not complete (cancel or error)", err);
      setWalletProcessing(null);
    }
  };

  useEffect(() => {
    if (!APPLE_PAY_ENABLED) {
      walletLog("Apple Pay: not rendering — NEXT_PUBLIC_FINIX_APPLE_PAY_MERCHANT_IDENTIFIER (or legacy NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID) is unset");
      return;
    }
    if (!allowedPaymentMethods.includes("APPLE_PAY")) {
      walletLog("Apple Pay: not rendering — APPLE_PAY not in this giving link's allowedPaymentMethods", allowedPaymentMethods);
      return;
    }
    if (serverAvailability?.APPLE_PAY && !serverAvailability.APPLE_PAY.enabledForOrganization) {
      walletLog("Apple Pay: not rendering — server-side availability check failed", serverAvailability.APPLE_PAY);
      return;
    }
    if (!isApplePayAvailable()) {
      walletLog(
        "Apple Pay: not rendering — ApplePaySession unsupported on this browser/device (Safari on macOS/iOS with a card in Wallet required)"
      );
      return;
    }
    walletLog("Apple Pay: all checks passed — rendering button");
    setAppleAvailable(true);
    loadApplePayButtonScript().catch((err) => walletLog("Apple Pay: button SDK failed to load", err));
  }, [allowedPaymentMethods, serverAvailability]);

  useEffect(() => {
    if (!googlePayGatewayMerchantId) {
      walletLog("Google Pay: not rendering — googlePayGatewayMerchantId is null (FINIX_APPLICATION_OWNER_ID unset server-side)");
      return;
    }
    if (!allowedPaymentMethods.includes("GOOGLE_PAY")) {
      walletLog("Google Pay: not rendering — GOOGLE_PAY not in this giving link's allowedPaymentMethods", allowedPaymentMethods);
      return;
    }
    if (serverAvailability?.GOOGLE_PAY && !serverAvailability.GOOGLE_PAY.enabledForOrganization) {
      walletLog("Google Pay: not rendering — server-side availability check failed", serverAvailability.GOOGLE_PAY);
      return;
    }
    let cancelled = false;
    walletLog("Google Pay: checking isReadyToPay with environment:", googlePayEnvironment);
    isGooglePayAvailable({
      environment: googlePayEnvironment,
      gatewayMerchantId: googlePayGatewayMerchantId,
      merchantId: googlePayMerchantId || undefined,
      merchantName: churchName,
    })
      .then((available) => {
        if (cancelled) return;
        if (!available) {
          walletLog("Google Pay: not rendering — isReadyToPay returned false/unavailable");
          return;
        }
        walletLog("Google Pay: isReadyToPay confirmed support — will render official button");
        // Only flips a flag here — the actual button is created and
        // appended in the effect below, which runs after React has
        // committed the re-render this triggers. Doing both in this same
        // async chain raced the DOM: googlePayButtonRef's <div> doesn't
        // exist until googleAvailable is true, but this chain could (and
        // did, in testing) resolve createGooglePayButton() before that
        // re-render committed, leaving the ref null when appendChild ran.
        setGoogleAvailable(true);
      })
      .catch((err) => walletLog("Google Pay: isReadyToPay threw", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googlePayGatewayMerchantId, googlePayEnvironment, googlePayMerchantId, allowedPaymentMethods]);

  useEffect(() => {
    if (!googleAvailable || !googlePayGatewayMerchantId) return;
    let cancelled = false;
    const config = {
      environment: googlePayEnvironment,
      gatewayMerchantId: googlePayGatewayMerchantId,
      merchantId: googlePayMerchantId || undefined,
      merchantName: churchName,
    };
    createGooglePayButton(config, () => handleGooglePayClickRef.current())
      .then((button) => {
        if (cancelled || !googlePayButtonRef.current) {
          walletLog("Google Pay: button created but discarded (cancelled or ref gone)");
          return;
        }
        googlePayButtonRef.current.innerHTML = "";
        googlePayButtonRef.current.appendChild(button);
        walletLog("Google Pay: button appended to DOM");
      })
      .catch((err) => walletLog("Google Pay: createGooglePayButton threw", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAvailable, googlePayGatewayMerchantId, googlePayEnvironment, googlePayMerchantId]);

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

  // firstName/lastName/email/phone are now always required, above the
  // payment options, for every method (see donorInfoValid) — only
  // donorNote/anonymousDonation still consult per-org visibility settings.
  const isFieldVisible = (key: keyof DonorFieldSettings) => donorFieldSettings[key] !== "HIDDEN";

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
    // Donor Information (first/last name, email, phone) is one shared,
    // required section above the payment options for every method —
    // card/bank/Apple Pay/Google Pay all enforce the same donorInfoValid
    // rule rather than each having its own partial check.
    if (!donorInfoValid) {
      toast.error("Enter your name, email, and phone number to continue.");
      focusFirstMissingDonorField();
      return;
    }
    if (!formInstanceRef.current || !formReady) {
      toast.error("Payment form is still loading — please wait a moment");
      return;
    }

    setSubmitting(true);
    setResult({ step: "processing" });

    try {
      // For ACH/bank payments, Finix.Auth callback never fires — skip it.
      // The backend already omits fraud_session_id for bank transfers.
      const fraudSessionId = paymentMethod === "bank" ? "" : await getFraudSessionId(finixMerchantId);

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
              clientAttemptId: attemptId,
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

          if (!res.ok || !data?.success) {
            setSubmitting(false);
            const errMsg = data?.message || (typeof data?.error === 'string' ? data.error : data?.error?.message) || "Payment failed. Please try again.";
            setResult({ step: "failed", error: errMsg });
            return;
          }

          if (data.recurring) {
            setSubmitting(false);
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
          setSubmitting(false);
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

      {/* Donor Information — one shared, required section for every payment
          method (card, bank, Apple Pay, Google Pay). Moved above the
          payment options so a donor can never reach a wallet sheet without
          WGC first having name/email/phone; Apple/Google's own wallet
          flow only ever returns a billing name/email (and never a phone
          number), so this was previously uncollectable for wallet gifts. */}
      <div>
        <h3 className="text-xs font-semibold mb-2" style={{ color: light.bodyTextColor }}>
          Donor Information
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="donor-first-name" className="block text-xs font-medium mb-1" style={{ color: light.bodyTextColor }}>
              First name <span aria-hidden="true">*</span>
            </label>
            <input
              id="donor-first-name"
              ref={firstNameRef}
              required
              aria-required="true"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: light.borderColor }}
            />
          </div>
          <div>
            <label htmlFor="donor-last-name" className="block text-xs font-medium mb-1" style={{ color: light.bodyTextColor }}>
              Last name <span aria-hidden="true">*</span>
            </label>
            <input
              id="donor-last-name"
              ref={lastNameRef}
              required
              aria-required="true"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: light.borderColor }}
            />
          </div>
        </div>
        <div className="mb-3">
          <label htmlFor="donor-email" className="block text-xs font-medium mb-1" style={{ color: light.bodyTextColor }}>
            Email <span aria-hidden="true">*</span>
          </label>
          <input
            id="donor-email"
            ref={emailRef}
            type="email"
            required
            aria-required="true"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: light.borderColor }}
          />
        </div>
        <div>
          <label htmlFor="donor-phone" className="block text-xs font-medium mb-1" style={{ color: light.bodyTextColor }}>
            Phone <span aria-hidden="true">*</span>
          </label>
          <input
            id="donor-phone"
            ref={phoneRef}
            type="tel"
            required
            aria-required="true"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: light.borderColor }}
          />
        </div>
        {isFieldVisible("donorNote") && (
          <input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full mt-3 px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ borderColor: light.borderColor }}
          />
        )}
        {isFieldVisible("anonymousDonation") && (
          <label className="flex items-center gap-2 text-sm mt-3" style={{ color: light.bodyTextColor }}>
            <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
            Give anonymously
          </label>
        )}
      </div>

      {feeCoverEnabled && effectiveAmountCents > 0 && (
        <label className="flex items-start gap-2 text-sm" style={{ color: light.bodyTextColor }}>
          <input type="checkbox" checked={coverFees} onChange={(e) => setCoverFees(e.target.checked)} className="mt-0.5" />
          <span>
            I&apos;ll cover the {formatCents(feeCoveredCents)} processing fee so my full{" "}
            {formatCents(effectiveAmountCents)} gift goes to {churchName}.
          </span>
        </label>
      )}

      {!isRecurring && (appleAvailable || googleAvailable) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold" style={{ color: light.bodyTextColor }}>
            Express checkout
          </h3>
          {!donorInfoValid && (
            <p className="text-xs" style={{ color: light.bodyTextColor }}>
              Enter your name, email, and phone number to continue.
            </p>
          )}
          {appleAvailable && (
            <div className={walletProcessing !== null ? "opacity-50 pointer-events-none" : !donorInfoValid ? "opacity-50" : undefined}>
              {/* Apple's official button web component — never hand-styled, per Apple's HIG.
                  Click is bound natively via applePayButtonRef in a useEffect above, not
                  a React onClick on this element or an ancestor — it doesn't reliably
                  deliver through React's synthetic event system in Safari. Deliberately
                  NOT pointer-events-none when donor info is incomplete — the click must
                  still reach handleApplePayClickRef so it can focus/scroll to the first
                  missing field instead of being silently blocked by CSS. */}
              {/* @ts-expect-error -- custom element from Apple's Apple Pay button SDK */}
              <apple-pay-button
                ref={applePayButtonRef}
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
            <div className={!donorInfoValid && walletProcessing === null ? "opacity-50" : undefined}>
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
                type="button"
                onClick={() => setPaymentMethod("card")}
                className="flex-1 py-2 rounded-lg text-sm font-semibold"
                style={paymentMethod === "card" ? { backgroundColor: light.buttonBackground, color: light.buttonText } : { color: light.bodyTextColor }}
              >
                Card
              </button>
            )}
            {cardBankMethods.includes("BANK") && (
              <button
                type="button"
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
