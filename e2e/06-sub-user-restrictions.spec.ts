import { test, expect } from "@playwright/test";
import { seedOrgWithOwner, seedSubUser, seedWgcSubscription, cleanupOrg, E2E_PASSWORD } from "./fixtures/db";
import { loginAsMerchant } from "./fixtures/auth";

/**
 * Journey 6: sub-user restrictions — a "fundraiser" or "viewer" role has
 * canViewSubscription: false (see src/lib/auth/roles.ts ROLE_PERMISSIONS —
 * only owner/admin have it true), so the subscription page must render
 * only the generic ComingSoon restricted-access message. This is a hard
 * security requirement: assert the DOM does NOT contain the plan name,
 * price, billing history table, promotion details, or the cancellation
 * button — never rely only on the presence of the generic message.
 */
test.describe("Sub-user billing restrictions", () => {
  let churchId: string | null = null;

  test.afterEach(async () => {
    await cleanupOrg(churchId);
  });

  for (const role of ["fundraiser", "viewer"] as const) {
    test(`${role} sees only the generic restricted-access message on the subscription page`, async ({ page, context }) => {
      const { church } = await seedOrgWithOwner({ namePrefix: `SubUserOrg-${role}`, billingSetupStatus: "BILLING_ACTIVE" });
      churchId = church.id;
      await seedWgcSubscription({ organizationId: church.id, status: "ACTIVE", amountCents: 1000 });
      const subUser = await seedSubUser(church.id, role);

      await loginAsMerchant(context.request, subUser.email, E2E_PASSWORD);
      await page.goto("/merchant/subscription");

      // The generic restricted-access message IS shown.
      await expect(page.getByText("Billing & Subscription", { exact: true })).toBeVisible();
      await expect(page.getByText(/don't have permission to view billing details/i)).toBeVisible();

      // None of the actual billing content is present anywhere in the DOM.
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toContain("WGC Platform Subscription");
      expect(bodyText).not.toContain("$10.00");
      expect(bodyText).not.toContain("Billing History");
      expect(bodyText).not.toContain("Billing Method");
      expect(bodyText).not.toContain("Promotional period active");
      expect(bodyText).not.toContain("Six Months Free");
      await expect(page.getByRole("button", { name: /Cancel Subscription/i })).toHaveCount(0);
    });
  }
});
