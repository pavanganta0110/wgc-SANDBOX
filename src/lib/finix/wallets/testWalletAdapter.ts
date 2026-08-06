"use client";

import type { ApplePayResult } from "./applePay";
import type { GooglePayResult } from "./googlePay";

/**
 * Real Apple Pay / Google Pay payment sheets are native, OS-owned UI — no
 * browser-automation tool (Playwright included) can open or drive them, and
 * neither Apple nor Google issue reusable test tokens that Finix will
 * accept from an automated script. This adapter is the substitution seam
 * e2e tests use instead: it sits at the exact call sites the real wallet
 * code uses (same amountCents in, same ApplePayResult/GooglePayResult shape
 * out), so everything around the wallet sheet — fee-coverage rebuild,
 * amount fidelity, submission, cancel/failure handling, duplicate
 * prevention — is exercised for real, while only the opaque native-sheet
 * boundary itself is scripted.
 *
 * Gated by NEXT_PUBLIC_ENABLE_TEST_WALLET_ADAPTER, which must never be set
 * to "true" in a production build/environment — see next.config and the
 * Playwright config, which is the only place this flag is set.
 */
export interface TestWalletAdapter {
  isApplePayAvailable: () => boolean;
  isGooglePayAvailable: () => boolean;
  beginApplePaySession: (opts: {
    amountCents: number;
    totalLabel: string;
    onValidateMerchant: (validationURL: string) => Promise<unknown>;
    onAuthorized: (result: ApplePayResult) => Promise<{ success: boolean }>;
    onCancel: () => void;
  }) => void;
  requestGooglePayment: (
    config: { environment: "TEST" | "PRODUCTION"; gatewayMerchantId: string; merchantId?: string; merchantName: string },
    amountCents: number
  ) => Promise<GooglePayResult>;
}

declare global {
  interface Window {
    __wgcTestWalletAdapter?: TestWalletAdapter;
  }
}

export function isTestWalletAdapterEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_TEST_WALLET_ADAPTER === "true";
}

export function getTestWalletAdapter(): TestWalletAdapter | null {
  if (!isTestWalletAdapterEnabled()) return null;
  if (typeof window === "undefined") return null;
  return window.__wgcTestWalletAdapter ?? null;
}
