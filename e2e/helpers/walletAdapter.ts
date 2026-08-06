import type { Page } from "@playwright/test";

export type WalletBehavior = "success" | "cancel" | "fail";

/**
 * Installs window.__wgcTestWalletAdapter before any page script runs, so
 * InvoicePublicView's getTestWalletAdapter() picks it up on first render.
 * Every call is recorded onto window.__walletAdapterCalls for the test to
 * read back with page.evaluate — this is how amount-fidelity assertions
 * work (e.g. "the amount passed to the wallet adapter equals the amount
 * shown in the on-page total").
 */
export async function installTestWalletAdapter(page: Page, behavior: WalletBehavior = "success") {
  await page.addInitScript((behaviorArg: string) => {
    (window as unknown as { __walletAdapterCalls: unknown[] }).__walletAdapterCalls = [];
    const record = (entry: unknown) => (window as unknown as { __walletAdapterCalls: unknown[] }).__walletAdapterCalls.push(entry);

    const testBillingContact = {
      name: "E2E Test Payer",
      address: { line1: "1 Test St", city: "Testville", region: "CA", postal_code: "94000", country: "US" },
      email: "e2e-payer@example.com",
    };

    (window as unknown as { __wgcTestWalletAdapter: unknown }).__wgcTestWalletAdapter = {
      isApplePayAvailable: () => true,
      isGooglePayAvailable: () => true,
      beginApplePaySession: (opts: {
        amountCents: number;
        onAuthorized: (result: { walletToken: string; billingContact: typeof testBillingContact }) => Promise<{ success: boolean }>;
        onCancel: () => void;
      }) => {
        record({ type: "apple_pay", amountCents: opts.amountCents, behavior: behaviorArg });
        if (behaviorArg === "cancel") {
          opts.onCancel();
          return;
        }
        // "success" and "fail" both authorize with a synthetic token — the
        // real Finix call downstream genuinely rejects a fake wallet token
        // (no automation tool can produce an authentic one), so "fail"
        // here exercises that real, unmocked rejection path end to end.
        // "success" scenarios instead mock the /pay network response
        // directly in the spec, since a real Finix success requires an
        // authentic token — see e2e/invoiceWallet.spec.ts's comments.
        void opts.onAuthorized({ walletToken: "E2E_FAKE_APPLE_PAY_TOKEN", billingContact: testBillingContact });
      },
      requestGooglePayment: (
        _config: unknown,
        amountCents: number
      ): Promise<{ walletToken: string; billingContact: typeof testBillingContact }> => {
        record({ type: "google_pay", amountCents, behavior: behaviorArg });
        if (behaviorArg === "cancel") {
          return Promise.reject(new Error("E2E_TEST_CANCELED"));
        }
        return Promise.resolve({ walletToken: "E2E_FAKE_GOOGLE_PAY_TOKEN", billingContact: testBillingContact });
      },
    };
  }, behavior);
}

export async function getWalletAdapterCalls(page: Page): Promise<Array<{ type: string; amountCents: number; behavior: string }>> {
  return page.evaluate(() => (window as unknown as { __walletAdapterCalls: Array<{ type: string; amountCents: number; behavior: string }> }).__walletAdapterCalls ?? []);
}
