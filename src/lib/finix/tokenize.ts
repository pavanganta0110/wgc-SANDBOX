"use client";

/**
 * Client-side Finix.js v2 tokenization form loader, per
 * docs.finix.com/guides/online-payments/payment-tokenization/tokenization-forms.
 * Mirrors the script-loading pattern in fraudSession.ts (same finix.js file
 * and Window.Finix typing, loaded once, never self-hosted per Finix's
 * requirement).
 */

import "./fraudSession";
import type { FinixPaymentFormInstance } from "./fraudSession";

const FINIX_JS_URL = "https://js.finix.com/v/2/finix.js";

let scriptLoadPromise: Promise<void> | null = null;

export function loadFinixScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadFinixScript can only run in the browser"));
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

/**
 * Mounts a Finix.PaymentForm into the given element ID. Returns the form
 * instance so the caller can trigger `submit()` from its own submit button
 * (Finix's form renders card/bank fields into an iframe; tokenization only
 * happens when submit() is called).
 */
export async function mountFinixPaymentForm(
  elementId: string,
  applicationId: string,
  options: {
    paymentMethods?: ("card" | "bank")[];
    showAddress?: boolean;
    // Per docs.finix.com/guides/online-payments/payment-tokenization/tokenization-forms:
    // fires as the buyer types into the hosted card field, before submit()/
    // tokenization. binInformation carries the network's own live BIN
    // lookup — the same brand detection that renders the network logo next
    // to the card field — never exposed as raw card data, safe for a host
    // page to read for a client-side fee preview.
    onUpdate?: (state: unknown, binInformation?: unknown, hasErrors?: boolean) => void;
  },
  environment: "sandbox" | "live" = (process.env.NEXT_PUBLIC_FINIX_ENV as "sandbox" | "live") || "sandbox"
): Promise<FinixPaymentFormInstance> {
  await loadFinixScript();

  if (!window.Finix) {
    throw new Error("Finix.js failed to initialize on window");
  }

  const container = document.getElementById(elementId);
  if (container) {
    container.innerHTML = "";
  }

  return window.Finix.PaymentForm(elementId, environment, applicationId, options);
}
