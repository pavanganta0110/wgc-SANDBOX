"use client";

/**
 * Google Pay on the Web, integrated against Finix per
 * docs.finix.com/guides/online-payments/digital-wallets/google-pay/google-pay-on-web.
 * gateway is always "finix"; gatewayMerchantId is the Finix Application
 * Owner Identity (passed in from the server — see FINIX_APPLICATION_OWNER_ID),
 * never a per-church Finix Merchant ID.
 */

const GOOGLE_PAY_SCRIPT_URL = "https://pay.google.com/gp/p/js/pay.js";

let scriptPromise: Promise<void> | null = null;

export function loadGooglePayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Pay can only load in the browser"));
  if (window.google?.payments?.api) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_PAY_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Pay")));
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_PAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Pay"));
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
    return Boolean(response?.result);
  } catch {
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
