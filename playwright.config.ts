import { defineConfig, devices } from "@playwright/test";

/**
 * Wallet-boundary Playwright coverage for the invoice payment page. See
 * docs/invoicing-wallet-testing.md for what this suite does and does not
 * prove — real Apple Pay / Google Pay sheets cannot be automated, so these
 * tests exercise everything around the wallet call site (amount fidelity,
 * fee-coverage rebuild, submission, cancel/success/failure UI handling)
 * against a test-only mock adapter (see src/lib/finix/wallets/testWalletAdapter.ts),
 * never against a real wallet sheet.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/globalSetup.ts",
  globalTeardown: "./e2e/globalTeardown.ts",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_ENABLE_TEST_WALLET_ADAPTER: "true",
      // This sandbox's .env.local has no Google Pay gateway merchant ID
      // configured, so the invoice page's own availability check
      // (data.googlePayGatewayMerchantId, sourced server-side from this
      // var) would hide the Google Pay button entirely regardless of the
      // test wallet adapter — the button visibility gate and the wallet
      // adapter are two separate concerns. A dummy value only satisfies
      // that gate for this test server; it's never sent to Google or Finix
      // since the test adapter fully replaces the Google Pay call path.
      FINIX_APPLICATION_OWNER_ID: "AP_e2e_test_dummy_owner",
    },
  },
});
