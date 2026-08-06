import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const FAKE_FINIX_PORT = 4310;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Playwright e2e config for the WGC platform-billing system.
 *
 * Two webServer entries are started automatically before the suite runs:
 *  1. A minimal local stand-in for the Finix API (e2e/fixtures/
 *     fakeFinixServer.mjs) — every spec that needs a Finix call to
 *     succeed (onboarding, subscription activation, cancellation) relies
 *     on `next dev` being pointed at THIS server, not the real Finix
 *     sandbox, since real Finix credentials are redacted at the process
 *     level in this environment.
 *  2. `next dev` itself, with FINIX_BASE_URL and FINIX_WGC_BILLING_MERCHANT_ID
 *     overridden to route through server #1. All other env vars
 *     (DATABASE_URL, AUTH_SESSION_SECRET, FINIX_WEBHOOK_SECRET, etc.) are
 *     inherited unchanged from the process environment / .env.local, so
 *     the suite runs against the same sandbox database the rest of this
 *     project's tests use.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // spec files share one Postgres database; keep runs serialized to avoid cross-test interference
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: `node e2e/fixtures/fakeFinixServer.mjs`,
      port: FAKE_FINIX_PORT,
      reuseExistingServer: !process.env.CI,
      env: { FAKE_FINIX_PORT: String(FAKE_FINIX_PORT) },
      timeout: 15_000,
    },
    {
      command: "npm run dev",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Route every finixClient call at the local fake Finix server
        // above instead of the real (credential-redacted) Finix sandbox.
        FINIX_BASE_URL: `http://127.0.0.1:${FAKE_FINIX_PORT}`,
        FINIX_USERNAME: "e2e-fake-username",
        FINIX_PASSWORD: "e2e-fake-password",
        // Not present in .env.local today (see report) — required by
        // src/lib/billing/wgcBillingConfig.ts's fail-closed check before
        // any WGC platform-subscription Finix call.
        FINIX_WGC_BILLING_MERCHANT_ID: "MU_e2e_wgc_billing_merchant",
      },
    },
  ],
});
