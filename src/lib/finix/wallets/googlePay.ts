"use client";

/**
 * Google Pay on the Web, integrated against Finix per
 * docs.finix.com/guides/online-payments/digital-wallets/google-pay/google-pay-on-web.
 * gateway is always "finix"; gatewayMerchantId is the Finix Application
 * Owner Identity (passed in from the server — see FINIX_APPLICATION_OWNER_ID),
 * never a per-church Finix Merchant ID.
 */

const GOOGLE_PAY_SCRIPT_URL = "https://pay.google.com/gp/p/js/pay.js";

// Sandbox-only diagnostic logging for the Google Pay integration — never
// logs in the live environment. Added while diagnosing why the button
// wasn't appearing; kept because the whole flow (script load -> isReadyToPay
// -> button render) is otherwise silent-by-design (see the `catch { return
// false }` in isGooglePayAvailable below), which made the original problem
// hard to see from the browser console alone.
const GOOGLE_PAY_DEBUG = typeof window !== "undefined" && process.env.NEXT_PUBLIC_FINIX_ENV !== "live";
function gpayLog(...args: unknown[]) {
  if (GOOGLE_PAY_DEBUG) console.log("[GooglePay:sandbox]", ...args);
}

let scriptPromise: Promise<void> | null = null;

export function loadGooglePayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Pay can only load in the browser"));
  if (window.google?.payments?.api) {
    gpayLog("script already loaded");
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_PAY_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        gpayLog("script loaded (existing tag)");
        resolve();
      });
      existing.addEventListener("error", (e) => {
        gpayLog("script FAILED to load (existing tag) — likely blocked by CSP script-src", e);
        reject(new Error("Failed to load Google Pay"));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_PAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      gpayLog("script loaded");
      resolve();
    };
    script.onerror = (e) => {
      gpayLog("script FAILED to load — likely blocked by CSP script-src or network", e);
      reject(new Error("Failed to load Google Pay"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

const BASE_CARD_PAYMENT_METHOD = {
  type: "CARD",
  parameters: {
    allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
    allowedCardNetworks: ["AMEX", "DISCOVER", "MASTERCARD", "VISA"],
    billingAddressRequired: true,
    billingAddressParameters: { format: "FULL" },
  },
};

function paymentMethodWithGateway(gatewayMerchantId: string) {
  return {
    ...BASE_CARD_PAYMENT_METHOD,
    tokenizationSpecification: {
      type: "PAYMENT_GATEWAY",
      parameters: { gateway: "finix", gatewayMerchantId },
    },
  };
}

export interface GooglePayConfig {
  environment: "TEST" | "PRODUCTION";
  gatewayMerchantId: string;
  merchantId?: string;
  merchantName: string;
}

export async function getGooglePaymentsClient(environment: "TEST" | "PRODUCTION") {
  gpayLog("creating PaymentsClient with environment:", environment);
  await loadGooglePayScript();
  return new window.google!.payments.api.PaymentsClient({ environment });
}

export async function isGooglePayAvailable(config: GooglePayConfig): Promise<boolean> {
  try {
    const client = await getGooglePaymentsClient(config.environment);
    const response = await client.isReadyToPay({
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [paymentMethodWithGateway(config.gatewayMerchantId)],
    });
    gpayLog("isReadyToPay response:", response);
    return Boolean(response?.result);
  } catch (err) {
    gpayLog("isReadyToPay threw — treating as not available:", err);
    return false;
  }
}

export interface GooglePayResult {
  walletToken: string;
  billingContact: {
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
  };
}

/**
 * Runs one Google Pay payment sheet. Every call requests a fresh token —
 * tokens are single-use and time-limited, matching the "process immediately,
 * never store" requirement.
 */
export async function requestGooglePayment(config: GooglePayConfig, amountCents: number): Promise<GooglePayResult> {
  const client = await getGooglePaymentsClient(config.environment);

  const paymentMethod = paymentMethodWithGateway(config.gatewayMerchantId);
  const paymentDataRequest = {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [paymentMethod],
    transactionInfo: {
      countryCode: "US",
      currencyCode: "USD",
      totalPriceStatus: "FINAL",
      totalPrice: (amountCents / 100).toFixed(2),
    },
    emailRequired: true,
    merchantInfo: {
      merchantId: config.merchantId,
      merchantName: config.merchantName,
    },
  };

  const paymentData = await client.loadPaymentData(paymentDataRequest);

  const billingAddress = paymentData.paymentMethodData?.info?.billingAddress;
  return {
    walletToken: paymentData.paymentMethodData.tokenizationData.token,
    billingContact: {
      name: billingAddress?.name || "",
      address: {
        line1: billingAddress?.address1,
        line2: billingAddress?.address2,
        city: billingAddress?.locality,
        region: billingAddress?.administrativeArea,
        postal_code: billingAddress?.postalCode,
        country: billingAddress?.countryCode,
      },
      email: paymentData.email,
    },
  };
}

export async function createGooglePayButton(
  config: GooglePayConfig,
  onClick: () => void
): Promise<HTMLElement> {
  const client = await getGooglePaymentsClient(config.environment);
  return client.createButton({
    onClick,
    buttonType: "donate",
    buttonSizeMode: "fill",
  });
}
