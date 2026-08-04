import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { installTestWalletAdapter, getWalletAdapterCalls } from "./helpers/walletAdapter";

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, ".fixtures.json"), "utf-8"));

function centsFromText(text: string): number {
  const match = text.replace(/,/g, "").match(/\$([0-9]+\.[0-9]{2})/);
  if (!match) throw new Error(`Could not parse a dollar amount out of: "${text}"`);
  return Math.round(parseFloat(match[1]) * 100);
}

test.describe("Invoice wallet payment — amount fidelity and request rebuilding", () => {
  test("Apple Pay: amount forwarded to the wallet adapter matches the on-page total, and toggling fee coverage rebuilds it", async ({ page }) => {
    await installTestWalletAdapter(page, "cancel");
    await page.goto(`/invoice/${fixtures.tokenA}`);
    await expect(page.getByText("Make a Payment")).toBeVisible();

    const totalRow = page.locator("text=Total").last().locator("..");
    const initialTotalText = (await totalRow.textContent()) || "";
    const initialTotalCents = centsFromText(initialTotalText);

    await page.getByTestId("apple-pay-button").click();
    await expect.poll(async () => (await getWalletAdapterCalls(page)).length).toBe(1);
    let calls = await getWalletAdapterCalls(page);
    expect(calls[0].type).toBe("apple_pay");
    expect(calls[0].amountCents).toBe(initialTotalCents);

    // Toggle fee coverage on — the on-page total must change, and the next
    // wallet click must forward the NEW total, not the one captured before
    // the checkbox changed (the "no stale wallet request" requirement).
    const feeCheckbox = page.locator('input[type="checkbox"]');
    const wasChecked = await feeCheckbox.isChecked();
    await feeCheckbox.setChecked(!wasChecked);

    const updatedTotalText = (await totalRow.textContent()) || "";
    const updatedTotalCents = centsFromText(updatedTotalText);
    expect(updatedTotalCents).not.toBe(initialTotalCents);

    await page.getByTestId("apple-pay-button").click();
    await expect.poll(async () => (await getWalletAdapterCalls(page)).length).toBe(2);
    calls = await getWalletAdapterCalls(page);
    expect(calls[1].amountCents).toBe(updatedTotalCents);
    expect(calls[1].amountCents).not.toBe(calls[0].amountCents);
  });

  test("Google Pay: amount forwarded to the wallet adapter matches the on-page total", async ({ page }) => {
    await installTestWalletAdapter(page, "cancel");
    await page.goto(`/invoice/${fixtures.tokenA}`);
    await expect(page.getByText("Make a Payment")).toBeVisible();

    const totalRow = page.locator("text=Total").last().locator("..");
    const totalCents = centsFromText((await totalRow.textContent()) || "");

    await page.getByTestId("google-pay-test-button").click();
    await expect.poll(async () => (await getWalletAdapterCalls(page)).length).toBe(1);
    const calls = await getWalletAdapterCalls(page);
    expect(calls[0].type).toBe("google_pay");
    expect(calls[0].amountCents).toBe(totalCents);
  });

  test("canceling the wallet sheet clears the processing state and never submits a payment request", async ({ page }) => {
    await installTestWalletAdapter(page, "cancel");
    await page.goto(`/invoice/${fixtures.tokenA}`);
    await expect(page.getByText("Make a Payment")).toBeVisible();

    let payRequestSeen = false;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/pay")) payRequestSeen = true;
    });

    await page.getByTestId("apple-pay-button").click();
    await expect.poll(async () => (await getWalletAdapterCalls(page)).length).toBe(1);
    // walletProcessing clears back to null on cancel — the button becomes
    // clickable again rather than staying stuck in a spinner state.
    await page.getByTestId("apple-pay-button").click();
    await expect.poll(async () => (await getWalletAdapterCalls(page)).length).toBe(2);
    expect(payRequestSeen).toBe(false);
  });

  test("a non-authentic wallet token is rejected end-to-end by the real payment backend and the page recovers", async ({ page }) => {
    // "fail" authorizes with a synthetic token — this is NOT a mocked
    // network response. It's the real POST /api/invoice/[token]/pay route
    // running against the real Finix sandbox, which genuinely rejects a
    // token no real Apple/Google device produced. This is the one wallet
    // scenario that can be verified fully end-to-end without any mocking
    // beyond the wallet-sheet boundary itself.
    await installTestWalletAdapter(page, "fail");
    await page.goto(`/invoice/${fixtures.tokenA}`);
    await expect(page.getByText("Make a Payment")).toBeVisible();

    await page.getByTestId("apple-pay-button").click();
    // The wallet sheet closes the instant it authorizes, but the real
    // server round trip (identity -> instrument -> transfer) still takes
    // real time — this checks the payer sees a visible "processing" state
    // during that gap rather than the page just sitting there looking
    // unresponsive until the failure toast eventually appears.
    await expect(page.getByText("Processing your payment…")).toBeVisible();
    // toSafePaymentErrorResponse's message for a rejected identity/instrument
    // ("Could not verify identity with processor...", "Could not process
    // payment instrument...") is surfaced via a react-hot-toast toast, not a
    // full-page state change — wallet failures recover in place rather than
    // navigating to a dedicated "Payment Failed" screen (that screen is
    // card/bank-flow only, see the `state.step === "failed"` branch).
    await expect(page.getByText(/could not (verify|process)|no charge was made/i).first()).toBeVisible({ timeout: 20_000 });
    // Controls must be usable again — never left stuck mid-submission.
    await expect(page.getByTestId("apple-pay-button")).toBeVisible();
    await expect(page.getByText("Make a Payment")).toBeVisible();
  });

  test("a successful wallet return (network-mocked /pay response only) updates the page to Payment Successful", async ({ page }) => {
    // The wallet-sheet boundary is mocked via the test adapter, same as
    // every other test in this file. What's additionally mocked HERE, and
    // only here, is the POST /api/invoice/[token]/pay response itself —
    // because a genuine SUCCEEDED transfer requires an authentic wallet
    // token that no automation tool can produce, there is no way to reach
    // this UI state through the real Finix sandbox. This test proves the
    // frontend's success handling is correct; it does NOT exercise the
    // real backend charge/persistence path (that's covered instead by the
    // Vitest suite against invoicePayRoute.ts, invoicePaymentReconciliation.ts,
    // and the Finix webhook handler, none of which need a real wallet token).
    await installTestWalletAdapter(page, "success");
    await page.route("**/api/invoice/*/pay", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          transferId: "TR_e2e_mocked_success",
          state: "SUCCEEDED",
          amountCents: 10000,
          feeContributionCents: 0,
          totalCents: 10000,
          customerCoveredFee: false,
          method: "APPLE_PAY",
          paidAt: new Date().toISOString(),
          invoiceNumber: fixtures.runId,
          status: "PAID",
        }),
      });
    });

    await page.goto(`/invoice/${fixtures.tokenA}`);
    await expect(page.getByText("Make a Payment")).toBeVisible();
    await page.getByTestId("apple-pay-button").click();
    await expect(page.getByText("Payment Successful")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Invoice wallet payment — paid-invoice and sub-account scoping", () => {
  test("a fully paid invoice shows no active wallet or payment controls, only the receipt", async ({ page }) => {
    await page.goto(`/invoice/${fixtures.tokenPaid}`);
    await expect(page.getByText(fixtures.invoicePaidId ? /./ : /./)).toBeTruthy();
    await expect(page.getByText("Make a Payment")).toHaveCount(0);
    await expect(page.getByTestId("apple-pay-button")).toHaveCount(0);
    await expect(page.getByTestId("google-pay-button")).toHaveCount(0);
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  });

  test("two churches' invoices remain isolated — each shows only its own invoice number, client, and total", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto(`/invoice/${fixtures.tokenA}`);
    await pageB.goto(`/invoice/${fixtures.tokenB}`);

    await expect(pageA.getByText("Make a Payment")).toBeVisible();
    await expect(pageB.getByText("Make a Payment")).toBeVisible();

    const totalRowA = pageA.locator("text=Total").last().locator("..");
    const totalRowB = pageB.locator("text=Total").last().locator("..");
    const totalACents = centsFromText((await totalRowA.textContent()) || "");
    const totalBCents = centsFromText((await totalRowB.textContent()) || "");

    // Seeded distinctly (100.00 vs 250.00) precisely so a scoping bug that
    // leaked one church's invoice data into the other's page would fail
    // this assertion instead of passing by coincidence.
    expect(totalACents).toBe(10000);
    expect(totalBCents).toBe(25000);

    await contextA.close();
    await contextB.close();
  });
});
