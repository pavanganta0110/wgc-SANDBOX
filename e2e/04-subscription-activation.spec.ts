import { test, expect } from "@playwright/test";
import { prisma, seedOrgWithOwner, seedSubUser, cleanupOrg, E2E_PASSWORD } from "./fixtures/db";
import { loginAsMerchant } from "./fixtures/auth";
import { createBillingActivationToken } from "@/lib/billing/billingActivation";

/**
 * Journey 4: subscription activation — a seeded APPROVED_BILLING_REQUIRED
 * org completes /api/billing/activate. finixClient is never mocked at the
 * module level here (Playwright drives a real `next dev` process, so
 * vi.doMock-style module interception doesn't apply) — instead the whole
 * suite's `next dev` webServer is started with FINIX_BASE_URL pointed at
 * the local fake Finix server (e2e/fixtures/fakeFinixServer.mjs, wired up
 * in playwright.config.ts), so finixClient's real HTTP calls land on that
 * mock instead of the real Finix sandbox — no real Finix call is ever made.
 */
test.describe("Subscription activation", () => {
  let churchId: string | null = null;

  test.afterEach(async () => {
    await cleanupOrg(churchId);
  });

  test("owner completes billing activation and the subscription becomes ACTIVE", async ({ context }) => {
    const { church, owner } = await seedOrgWithOwner({ namePrefix: "ActivationOrg", billingSetupStatus: "APPROVED_BILLING_REQUIRED" });
    churchId = church.id;

    await loginAsMerchant(context.request, owner.email, E2E_PASSWORD);

    const rawToken = await createBillingActivationToken(church.id);

    const res = await context.request.post("/api/billing/activate", {
      data: {
        token: rawToken,
        financeInstrumentToken: "TKe2efaketoken",
        paymentMethodType: "card",
        authorizationAccepted: true,
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.subscription.status).toBe("ACTIVE");

    const subscription = await prisma.wgcSubscription.findUnique({ where: { organizationId: church.id } });
    expect(subscription).toBeTruthy();
    expect(subscription!.finixSubscriptionId).toBeTruthy();
    expect(subscription!.status).toBe("ACTIVE");

    const updatedChurch = await prisma.church.findUnique({ where: { id: church.id } });
    expect(updatedChurch!.billingSetupStatus).toBe("BILLING_ACTIVE");

    const billingAccount = await prisma.wgcBillingAccount.findUnique({ where: { organizationId: church.id } });
    expect(billingAccount).toBeTruthy();
    expect(billingAccount!.status).toBe("ACTIVE");

    // Token is single-use.
    const secondAttempt = await context.request.post("/api/billing/activate", {
      data: {
        token: rawToken,
        financeInstrumentToken: "TKe2efaketoken2",
        paymentMethodType: "card",
        authorizationAccepted: true,
      },
    });
    expect(secondAttempt.status()).toBe(400);
  });

  test("a non-owner sub-user cannot activate billing", async ({ context }) => {
    const { church } = await seedOrgWithOwner({ namePrefix: "ActivationOrgNonOwner", billingSetupStatus: "APPROVED_BILLING_REQUIRED" });
    churchId = church.id;

    const fundraiser = await seedSubUser(church.id, "fundraiser");

    await loginAsMerchant(context.request, fundraiser.email, E2E_PASSWORD);
    const rawToken = await createBillingActivationToken(church.id);

    const res = await context.request.post("/api/billing/activate", {
      data: { token: rawToken, financeInstrumentToken: "TKe2efaketoken", paymentMethodType: "card", authorizationAccepted: true },
    });
    expect(res.status()).toBe(403);

    const subscription = await prisma.wgcSubscription.findUnique({ where: { organizationId: church.id } });
    expect(subscription).toBeNull();
  });
});
