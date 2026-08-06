import { test, expect } from "@playwright/test";
import { seedOrgWithOwner, seedWgcSubscription, cleanupOrg, E2E_PASSWORD } from "./fixtures/db";
import { loginAsMerchant } from "./fixtures/auth";

/**
 * Journey 9: grace period — a PAST_DUE-in-grace org (gracePeriodEndsAt in
 * the future) still has full dashboard access, per accessGate.ts's
 * PAST_DUE_IN_GRACE state (fullAccessAllowed: true), with
 * BillingGateBanner shown per src/components/merchant/BillingGateBanner.tsx.
 */
test.describe("Grace period access", () => {
  let churchId: string | null = null;

  test.afterEach(async () => {
    await cleanupOrg(churchId);
  });

  test("PAST_DUE org within its grace period keeps dashboard access and sees the warning banner", async ({ page, context }) => {
    const { church, owner } = await seedOrgWithOwner({ namePrefix: "GracePeriodOrg", billingSetupStatus: "BILLING_ACTIVE" });
    churchId = church.id;
    const gracePeriodEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days out
    await seedWgcSubscription({
      organizationId: church.id,
      status: "PAST_DUE",
      amountCents: 1000,
      pastDueAt: new Date(),
      gracePeriodEndsAt,
    });

    await loginAsMerchant(context.request, owner.email, E2E_PASSWORD);
    await page.goto("/merchant/dashboard");

    // Full dashboard access — never redirected to a restricted-only page.
    await expect(page).toHaveURL(/\/merchant\/dashboard/);

    // Warning banner per BillingGateBanner's PAST_DUE_IN_GRACE copy.
    await expect(page.getByText(/last WGC subscription payment was unsuccessful/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Update Billing" })).toBeVisible();

    // Other dashboard nav is still reachable — access isn't restricted.
    await page.goto("/merchant/donors");
    await expect(page).toHaveURL(/\/merchant\/donors/);
  });

  test("PAST_DUE org past its grace period is restricted", async ({ page, context }) => {
    const { church, owner } = await seedOrgWithOwner({ namePrefix: "GraceExpiredOrg", billingSetupStatus: "BILLING_ACTIVE" });
    churchId = church.id;
    const gracePeriodEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
    await seedWgcSubscription({
      organizationId: church.id,
      status: "PAST_DUE",
      amountCents: 1000,
      pastDueAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      gracePeriodEndsAt,
    });

    await loginAsMerchant(context.request, owner.email, E2E_PASSWORD);

    // Assert at the HTTP/SSR level rather than through the browser here:
    // `next dev` compiles this route on first visit, and (separately) a
    // thrown Server Component error's rendering can race Playwright's
    // load-state detection in dev mode — the raw SSR'd HTML is the
    // reliable signal that (dashboard)/error.tsx's boundary (or the
    // layout's BillingGateBanner, which wraps it) actually rendered the
    // restriction, independent of client hydration timing.
    const res = await context.request.get("/merchant/dashboard");
    const html = await res.text();
    expect(html).toMatch(/grace period has ended|isn.t available right now/i);

    // Also confirm it renders the same way through the browser. NOTE: in
    // THIS sandbox's Playwright/Chromium this consistently rendered a
    // blank page instead — the browser console shows "eval() is not
    // supported in this environment" on every navigation, which breaks
    // Next.js dev-mode client hydration entirely (see spec 10's matching
    // finding and the completion report); the SSR-level assertion above
    // is what actually exercises the server-side enforcement and is not
    // affected by that. Left in as-is since it's expected to pass in a
    // normal browser.
    await page.goto("/merchant/dashboard");
    await expect(page.getByText(/grace period has ended|isn.t available right now/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
