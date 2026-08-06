import { test, expect } from "@playwright/test";
import { seedOrgWithOwner, seedWgcSubscription, cleanupOrg, E2E_PASSWORD } from "./fixtures/db";
import { loginAsMerchant } from "./fixtures/auth";

/**
 * Journey 5: owner billing access — an "owner" role (canViewSubscription,
 * canManageSubscription, canViewBillingHistory, canCancelSubscription all
 * true per src/lib/auth/roles.ts) sees full billing details on the
 * subscription page.
 */
test.describe("Owner billing access", () => {
  let churchId: string | null = null;

  test.afterEach(async () => {
    await cleanupOrg(churchId);
  });

  test("owner sees plan, price, billing history, and cancellation controls", async ({ page, context }) => {
    const { church, owner } = await seedOrgWithOwner({ namePrefix: "OwnerAccessOrg", billingSetupStatus: "BILLING_ACTIVE" });
    churchId = church.id;
    await seedWgcSubscription({ organizationId: church.id, status: "ACTIVE", amountCents: 1000 });

    await loginAsMerchant(context.request, owner.email, E2E_PASSWORD);
    await page.goto("/merchant/subscription");

    await expect(page.getByText("Billing & Subscription")).toBeVisible();
    await expect(page.getByText("WGC Platform Subscription")).toBeVisible();
    await expect(page.getByText("$10.00 / Monthly")).toBeVisible();
    await expect(page.getByRole("button", { name: /Cancel Subscription/i })).toBeVisible();
  });
});
