"use client";

import { createContext, useCallback, useContext } from "react";
import { toPaymentWording } from "@/lib/settings/paymentMode";

const PaymentModeContext = createContext(false);

/** Provided once by the merchant dashboard layout from the organization's payment-mode setting. */
export function PaymentModeProvider({ paymentMode, children }: { paymentMode: boolean; children: React.ReactNode }) {
  return <PaymentModeContext.Provider value={paymentMode}>{children}</PaymentModeContext.Provider>;
}

/**
 * Client-component counterpart of getPaymentWording(): `pw()` turns donation-style labels into payment wording
 * when the organization is in payment mode and returns them untouched otherwise (and outside the dashboard).
 */
export function usePaymentWording() {
  const paymentMode = useContext(PaymentModeContext);
  return useCallback((text: string) => (paymentMode ? toPaymentWording(text) : text), [paymentMode]);
}
