"use client";

/**
 * Apple Pay on the Web, integrated against Finix per
 * docs.finix.com/guides/online-payments/digital-wallets/apple-pay/apple-pay-on-web.
 *
 * Two separate Apple-provided pieces are involved:
 *  - ApplePaySession: a native WebKit API (Safari only), no script load
 *    needed — used to run the actual payment sheet.
 *  - <apple-pay-button>: Apple's official button web component, loaded from
 *    Apple's own CDN, used only to render an HIG-compliant button (never
 *    hand-rolled — Apple's guidelines require using their button).
 */

const APPLE_PAY_BUTTON_SDK_URL = "https://applepay.cdn-apple.com/jsapi/v1/apple-pay-sdk.js";

let buttonScriptPromise: Promise<void> | null = null;

export function loadApplePayButtonScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Apple Pay can only load in the browser"));
  if (customElements.get("apple-pay-button")) return Promise.resolve();
  if (buttonScriptPromise) return buttonScriptPromise;

  buttonScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_PAY_BUTTON_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Apple Pay button SDK")));
      return;
    }
    const script = document.createElement("script");
    script.src = APPLE_PAY_BUTTON_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Apple Pay button SDK"));
    document.head.appendChild(script);
  });

  return buttonScriptPromise;
}

/**
 * Per requirement: only ever show the button when the browser/device
 * actually supports Apple Pay and the donor has a card set up.
 */
export function isApplePayAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "ApplePaySession" in window &&
    typeof window.ApplePaySession?.canMakePayments === "function" &&
    window.ApplePaySession.canMakePayments()
  );
}

export interface ApplePayBillingContact {
  name: string;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  email?: string;
}

export interface ApplePayResult {
  walletToken: string;
  billingContact: ApplePayBillingContact;
}

function contactToBillingContact(contact: ApplePayJS.ApplePayPaymentContact | undefined): ApplePayBillingContact {
  const name = [contact?.givenName, contact?.familyName].filter(Boolean).join(" ").trim();
  return {
    name,
    address: {
      line1: contact?.addressLines?.[0],
      line2: contact?.addressLines?.[1],
      city: contact?.locality,
      region: contact?.administrativeArea,
      postal_code: contact?.postalCode,
      country: contact?.countryCode,
    },
    email: contact?.emailAddress,
  };
}

/**
 * Runs one Apple Pay payment sheet from tap to authorization. Every call
 * gets a brand-new ApplePaySession — sessions cannot be reused across
 * donations, matching the fresh-idempotency-attempt requirement for every
 * new charge.
 */
export function beginApplePaySession(opts: {
  amountCents: number;
  totalLabel: string;
  countryCode?: string;
  currencyCode?: string;
  onValidateMerchant: (validationURL: string) => Promise<unknown>;
  onAuthorized: (result: ApplePayResult) => Promise<{ success: boolean }>;
  onCancel: () => void;
}): void {
  if (!isApplePayAvailable()) return;

  const request: ApplePayJS.ApplePayPaymentRequest = {
    countryCode: opts.countryCode || "US",
    currencyCode: opts.currencyCode || "USD",
    // Per Finix's guide: supports3DS is required; the full major-network
    // list matches what Finix's card processing already accepts elsewhere
    // in this app (see DonationForm's card flow).
    merchantCapabilities: ["supports3DS"],
    supportedNetworks: ["visa", "masterCard", "amex", "discover"],
    requiredBillingContactFields: ["postalAddress", "name", "email"],
    total: {
      label: opts.totalLabel,
      amount: (opts.amountCents / 100).toFixed(2),
    },
  };

  const session = new window.ApplePaySession!(3, request);

  session.onvalidatemerchant = async (event) => {
    try {
      const merchantSession = await opts.onValidateMerchant(event.validationURL);
      session.completeMerchantValidation(merchantSession);
    } catch {
      session.abort();
      opts.onCancel();
    }
  };

  session.onpaymentauthorized = async (event) => {
    try {
      // Finix expects third_party_token as the stringified form of
      // { token: <the full Apple Pay token object> } — not just the inner
      // paymentData — per docs.finix.com's Apple Pay guide.
      const walletToken = JSON.stringify({ token: event.payment.token });
      const billingContact = contactToBillingContact(event.payment.billingContact);
      const result = await opts.onAuthorized({ walletToken, billingContact });
      session.completePayment({
        status: result.success ? window.ApplePaySession!.STATUS_SUCCESS : window.ApplePaySession!.STATUS_FAILURE,
      });
    } catch {
      session.completePayment({ status: window.ApplePaySession!.STATUS_FAILURE });
    }
  };

  session.oncancel = () => {
    opts.onCancel();
  };

  session.begin();
}
