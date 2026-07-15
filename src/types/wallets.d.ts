// @types/applepayjs declares the global `ApplePaySession` class but doesn't
// augment `Window` with it — added here since we feature-detect via
// `window.ApplePaySession`. Google Pay ships no official type package, so
// its `window.google.payments.api` surface is declared minimally below,
// covering only what src/lib/finix/wallets/googlePay.ts actually uses.

interface GooglePayIsReadyToPayResponse {
  result: boolean;
}

interface GooglePayButtonOptions {
  onClick: () => void;
  buttonType?: string;
  buttonColor?: string;
  buttonSizeMode?: string;
}

interface GooglePaymentsClient {
  isReadyToPay(request: Record<string, unknown>): Promise<GooglePayIsReadyToPayResponse>;
  loadPaymentData(request: Record<string, unknown>): Promise<{
    email?: string;
    paymentMethodData: {
      tokenizationData: { token: string };
      info?: {
        billingAddress?: {
          name?: string;
          address1?: string;
          address2?: string;
          locality?: string;
          administrativeArea?: string;
          postalCode?: string;
          countryCode?: string;
        };
      };
    };
  }>;
  createButton(options: GooglePayButtonOptions): HTMLElement;
}

interface Window {
  ApplePaySession?: typeof ApplePaySession;
  google?: {
    payments: {
      api: {
        PaymentsClient: new (options: { environment: "TEST" | "PRODUCTION" }) => GooglePaymentsClient;
      };
    };
  };
}
