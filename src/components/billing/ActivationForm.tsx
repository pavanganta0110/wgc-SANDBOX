"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";
import { formatCents } from "@/lib/format";
import SubscriptionLegalFooterLinks from "@/components/support/SubscriptionLegalFooterLinks";
import { isApplePayAvailable, loadApplePayButtonScript, beginApplePaySession, type ApplePayResult } from "@/lib/finix/wallets/applePay";
import { isGooglePayAvailable, createGooglePayButton, requestGooglePayment, type GooglePayResult } from "@/lib/finix/wallets/googlePay";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";

interface WalletConfig {
  googlePayGatewayMerchantId: string | null;
  googlePayMerchantId: string | null;
  googlePayEnvironment: "TEST" | "PRODUCTION";
}

function estimatedFirstChargeDate(durationMonths: number | null): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + (durationMonths ?? 0));
  return d;
}

export default function ActivationForm({
  token,
  organizationName,
  isPromotional,
  durationMonths,
  regularMonthlyAmountCents,
  // When rendered inside the merchant dashboard (e.g. /merchant/subscription's
  // in-app activation path), the dashboard layout already provides its own
  // page chrome (sidebar, header, logo) — the standalone full-page wrapper
  // and duplicate logo used for the emailed /activate-subscription/[token]
  // page would look broken nested inside that. embedded=true renders just
  // the card content instead.
  embedded = false,
}: {
  token: string;
  organizationName: string;
  isPromotional: boolean;
  durationMonths: number | null;
  regularMonthlyAmountCents: number;
  embedded?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [formReady, setFormReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethodType, setPaymentMethodType] = useState<"card" | "bank">("card");
  const [walletConfig, setWalletConfig] = useState<WalletConfig | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [walletProcessing, setWalletProcessing] = useState<"apple_pay" | "google_pay" | null>(null);
  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);
  const applePayButtonRef = useRef<HTMLDivElement>(null);
  const googlePayButtonRef = useRef<HTMLDivElement>(null);

  // Remounts the Finix card/bank form, clearing the container first —
  // Finix.PaymentForm appends into the container rather than replacing its
  // contents, so calling this unconditionally on every mount is what
  // guarantees exactly one form is ever present, regardless of why the
  // mount ran (payment-method toggle, a fresh route mount, or the
  // bfcache-restore case below).
  const remountFinixForm = () => {
    if (!APPLICATION_ID) return;
    setFormReady(false);
    const container = document.getElementById("wgc-billing-finix-form");
    if (container) container.innerHTML = "";
    mountFinixPaymentForm("wgc-billing-finix-form", APPLICATION_ID, { paymentMethods: [paymentMethodType], showAddress: false })
      .then((instance) => {
        formInstanceRef.current = instance;
        setFormReady(true);
      })
      .catch(() => {
        toast.error("Could not load the secure billing form. Please refresh and try again.");
      });
  };

  useEffect(() => {
    remountFinixForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethodType]);

  useEffect(() => {
    // Browsers can restore this page from the back/forward cache (bfcache)
    // when navigating back from /subscription-terms, /support, etc. — the
    // frozen DOM snapshot is resumed as-is with `pageshow`'s
    // event.persisted === true, without React remounting this component or
    // its effects re-running on their own. Without this listener, the
    // restored page shows whatever the Finix form looked like at the
    // moment of navigating away, and can appear to "double up" if that
    // moment coincided with an in-flight remount. Explicitly clearing and
    // remounting on every persisted pageshow guarantees a single fresh
    // form no matter how the page was reached.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) remountFinixForm();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/billing/wallet-config")
      .then((res) => res.json())
      .then((data: WalletConfig) => setWalletConfig(data))
      .catch(() => {});
  }, []);

  const submitWalletActivation = async (
    method: "apple_pay" | "google_pay",
    walletResult: ApplePayResult | GooglePayResult
  ): Promise<{ success: boolean }> => {
    setWalletProcessing(method);
    try {
      const res = await fetch("/api/billing/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          paymentMethodType: method,
          walletToken: walletResult.walletToken,
          walletBillingContact: walletResult.billingContact,
          authorizationAccepted: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not activate your subscription.");
      toast.success("Your WGC Platform subscription is now active.");
      router.push("/merchant/subscription");
      return { success: true };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate your subscription. Please try again.");
      return { success: false };
    } finally {
      setWalletProcessing(null);
    }
  };

  const handleApplePayClickRef = useRef<() => void>(() => {});
  handleApplePayClickRef.current = () => {
    if (!authorized) {
      toast.error("You must authorize the subscription before continuing.");
      return;
    }
    if (walletProcessing) return;
    beginApplePaySession({
      amountCents: isPromotional ? 0 : regularMonthlyAmountCents,
      totalLabel: "WGC Platform Subscription",
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
      onAuthorized: (walletResult) => submitWalletActivation("apple_pay", walletResult),
      onCancel: () => setWalletProcessing(null),
    });
  };

  useEffect(() => {
    setAppleAvailable(isApplePayAvailable());
    if (!isApplePayAvailable()) return;
    loadApplePayButtonScript().catch(() => {});
  }, []);

  useEffect(() => {
    if (!appleAvailable) return;
    const el = applePayButtonRef.current;
    if (!el) return;
    const onClick = () => handleApplePayClickRef.current();
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [appleAvailable]);

  useEffect(() => {
    if (!walletConfig?.googlePayGatewayMerchantId) return;
    let cancelled = false;
    isGooglePayAvailable({
      environment: walletConfig.googlePayEnvironment,
      gatewayMerchantId: walletConfig.googlePayGatewayMerchantId,
      merchantId: walletConfig.googlePayMerchantId || undefined,
      merchantName: "WGC Payments",
    }).then((available) => {
      if (cancelled || !available) return;
      setGoogleAvailable(true);
    });
    return () => {
      cancelled = true;
    };
  }, [walletConfig]);

  useEffect(() => {
    if (!googleAvailable || !walletConfig?.googlePayGatewayMerchantId) return;
    const container = googlePayButtonRef.current;
    if (!container) return;
    let cancelled = false;
    createGooglePayButton(
      {
        environment: walletConfig.googlePayEnvironment,
        gatewayMerchantId: walletConfig.googlePayGatewayMerchantId,
        merchantId: walletConfig.googlePayMerchantId || undefined,
        merchantName: "WGC Payments",
      },
      async () => {
        if (!authorized) {
          toast.error("You must authorize the subscription before continuing.");
          return;
        }
        if (walletProcessing) return;
        setWalletProcessing("google_pay");
        try {
          const walletResult = await requestGooglePayment(
            {
              environment: walletConfig.googlePayEnvironment,
              gatewayMerchantId: walletConfig.googlePayGatewayMerchantId!,
              merchantId: walletConfig.googlePayMerchantId || undefined,
              merchantName: "WGC Payments",
            },
            isPromotional ? 0 : regularMonthlyAmountCents
          );
          await submitWalletActivation("google_pay", walletResult);
        } catch {
          setWalletProcessing(null);
        }
      },
      "subscribe"
    ).then((button) => {
      if (cancelled || !container) return;
      container.innerHTML = "";
      container.appendChild(button);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAvailable, walletConfig, authorized]);

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

  const estimatedFirstCharge = estimatedFirstChargeDate(isPromotional ? durationMonths : 0);
  const showWallets = appleAvailable || googleAvailable;

  const card = (
    <div className={embedded ? "max-w-lg bg-white rounded-2xl border border-slate-100 shadow-sm p-8" : "max-w-lg w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8"}>
        <h1 className="text-xl font-bold text-slate-900 mb-1">Activate your WGC Platform subscription</h1>
        <p className="text-sm text-slate-500 mb-6">{organizationName}</p>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mb-6 text-sm space-y-1.5">
          {isPromotional ? (
            <>
              <p>
                <span className="font-semibold">Promotional price:</span> $0/month for the first {durationMonths} months
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

        <label className="flex items-start gap-2 text-xs text-slate-600 mb-5">
          <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-0.5" />
          <span>
            I authorize WGC Payments to use my selected billing method for the WGC Platform subscription.
            {isPromotional
              ? ` My platform fee will be $0 for the first ${durationMonths} months. After the promotional period, `
              : " "}
            I authorize WGC Payments to charge {formatCents(regularMonthlyAmountCents)} per month until I cancel.
          </span>
        </label>

        {showWallets && (
          <div className="mb-5 space-y-2">
            {appleAvailable && (
              // Apple's official <apple-pay-button> custom element — never
              // hand-rolled, per Apple's Human Interface Guidelines.
              // @ts-expect-error -- custom element from Apple's own SDK, not in JSX's known element list
              <apple-pay-button
                ref={applePayButtonRef}
                buttonstyle="black"
                type="subscribe"
                locale="en"
                style={{ width: "100%", height: "44px", display: walletProcessing ? "none" : "block" }}
              />
            )}
            {googleAvailable && <div ref={googlePayButtonRef} className={walletProcessing ? "hidden" : "w-full"} />}
            {walletProcessing && (
              <div className="w-full py-3 rounded-full bg-slate-100 text-slate-500 text-sm font-semibold text-center">
                Waiting for {walletProcessing === "apple_pay" ? "Apple Pay" : "Google Pay"}…
              </div>
            )}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-xs text-slate-400 font-semibold">OR</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
          </div>
        )}

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

        <button
          onClick={submit}
          disabled={submitting || !authorized}
          className="w-full py-3 rounded-full bg-slate-900 text-white font-semibold disabled:opacity-50"
        >
          {submitting ? "Activating…" : "Activate Subscription"}
        </button>

        <div className="mt-6">
          <SubscriptionLegalFooterLinks returnTo={pathname || "/test-billing-form"} />
        </div>
    </div>
  );

  if (embedded) return card;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex flex-col items-center justify-center">
      <div className="mb-6 flex justify-center">
        <img src="/wgc-logo.png" alt="WGC Payments Logo" className="h-12 object-contain" />
      </div>
      {card}
    </div>
  );
}
