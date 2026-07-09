"use client";

/**
 * Client-side helper for Finix's Fraud Detection API, per
 * docs.finix.com/guides/online-payments/fraud-and-risk/fraud-detection.
 *
 * Loads Finix.js, initializes Finix.Auth for a given merchant, and returns
 * the session key that must be sent as fraud_session_id on the first
 * Authorization/Transfer that debits the buyer's payment instrument in a
 * checkout session.
 *
 * Usage on a checkout/donation page:
 *   const fraudSessionId = await getFraudSessionId(merchantId);
 *   // include fraudSessionId as fraud_session_id in the payment request
 *   // sent to POST /api/... (which forwards it to finixClient.createTransfer)
 */

export interface FinixTokenResponse {
  data?: {
    id: string;
    instrument_type: "PAYMENT_CARD" | "BANK_ACCOUNT";
    expires_at?: string;
  };
}

interface FinixPaymentFormOptions {
  paymentMethods?: ("card" | "bank")[];
  showAddress?: boolean;
  // Deliberately no onSubmit here — per docs.finix.com/guides/online-payments/payment-tokenization/tokenization-forms,
  // including onSubmit in the options makes Finix auto-render its own
  // submit button inside the form. We use a custom button instead, which
  // means calling form.submit(callback) directly (confirmed below).
  onLoad?: () => void;
  onUpdate?: (state: unknown, binInformation?: unknown, hasErrors?: boolean) => void;
}

export interface FinixPaymentFormInstance {
  // Confirmed against docs.finix.com: for the custom-button pattern,
  // form.submit() takes ONLY a callback — no environment/applicationId args.
  submit: (callback: (error: unknown, response: FinixTokenResponse) => void) => void;
}

declare global {
  interface Window {
    Finix?: {
      Auth: (
        environment: "sandbox" | "live",
        merchantId: string,
        callback?: (sessionKey: string) => void
      ) => {
        getSessionKey: () => string;
        connect: (merchantId: string, callback?: (sessionKey: string) => void) => void;
      };
      PaymentForm: (
        elementId: string,
        environment: "sandbox" | "live",
        applicationId: string,
        options: FinixPaymentFormOptions
      ) => FinixPaymentFormInstance;
    };
  }
}

const FINIX_JS_URL = "https://js.finix.com/v/2/finix.js";

let scriptLoadPromise: Promise<void> | null = null;

function loadFinixScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("getFraudSessionId can only run in the browser"));
  }

  if (window.Finix) {
    return Promise.resolve();
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FINIX_JS_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Finix.js")));
      return;
    }

    const script = document.createElement("script");
    script.src = FINIX_JS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Finix.js"));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

type FinixAuthInstance = ReturnType<NonNullable<Window["Finix"]>["Auth"]>;

let finixAuthInstance: FinixAuthInstance | null = null;

/**
 * Returns a fresh fraud_session_id for the given merchant. Call this once
 * per checkout session (e.g. on page load / when the donation form mounts),
 * and pass a new one whenever the buyer starts a new checkout session per
 * Finix's guidance (returning after time away, new browser/device, etc.).
 *
 * Uses Finix.Auth's callback (per Step 2 of Finix's guide) rather than
 * calling getSessionKey() immediately after Auth() — the guide documents
 * the callback firing "once the library has finished initializing",
 * implying initialization isn't guaranteed synchronous, so we wait for it.
 */
export async function getFraudSessionId(
  merchantId: string,
  environment: "sandbox" | "live" = (process.env.NEXT_PUBLIC_FINIX_ENV as "sandbox" | "live") || "sandbox"
): Promise<string> {
  await loadFinixScript();

  if (!window.Finix) {
    throw new Error("Finix.js failed to initialize on window");
  }

  return new Promise((resolve, reject) => {
    try {
      finixAuthInstance = window.Finix!.Auth(environment, merchantId, (sessionKey) => {
        resolve(sessionKey);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Finix.Auth initialization failed"));
    }
  });
}

/**
 * Per Finix's "Managing Different Sellers" section — switches the existing
 * Finix.Auth tracking session to a new merchant (e.g. a multi-tenant
 * checkout page) without reloading finix.js, and returns the new session key.
 * Must be called after getFraudSessionId() has run at least once on this page.
 */
export async function connectFraudSession(merchantId: string): Promise<string> {
  if (!finixAuthInstance) {
    throw new Error(
      "connectFraudSession called before getFraudSessionId — no active Finix.Auth instance to connect from."
    );
  }

  return new Promise((resolve) => {
    finixAuthInstance!.connect(merchantId, (sessionKey) => {
      resolve(sessionKey);
    });
  });
}
