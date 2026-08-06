import { test, expect } from "@playwright/test";
import { prisma, seedOrgWithOwner, seedWgcSubscription, cleanupOrg, E2E_PASSWORD } from "./fixtures/db";
import { loginAsMerchant } from "./fixtures/auth";
import { createBillingActivationToken } from "@/lib/billing/billingActivation";

/**
 * Journey 11: cross-organization access prevention — org A's authenticated
 * user attempts to view/act on org B's billing data via direct URL/API
 * manipulation. Every billing route derives organizationId from the
 * authenticated session (auth.churchId), never from a request body/URL
 * param, so org A must get 403/a validation error, never org B's data.
 */
test.describe("Cross-organization billing access prevention", () => {
  let orgAChurchId: string | null = null;
  let orgBChurchId: string | null = null;

  test.afterEach(async () => {
    await cleanupOrg(orgAChurchId);
    await cleanupOrg(orgBChurchId);
  });

  test("org A cannot cancel org B's subscription, view org B's subscription page, or use org B's activation token", async ({ page, context }) => {
    const orgA = await seedOrgWithOwner({ namePrefix: "CrossOrgA", billingSetupStatus: "BILLING_ACTIVE" });
    const orgB = await seedOrgWithOwner({ namePrefix: "CrossOrgB", billingSetupStatus: "BILLING_ACTIVE" });
    orgAChurchId = orgA.church.id;
    orgBChurchId = orgB.church.id;

    await seedWgcSubscription({ organizationId: orgA.church.id, status: "ACTIVE", amountCents: 1000 });
    const orgBSubscription = await seedWgcSubscription({ organizationId: orgB.church.id, status: "ACTIVE", amountCents: 1000 });

    await loginAsMerchant(context.request, orgA.owner.email, E2E_PASSWORD);

    // 1. The cancel API never accepts an organizationId/subscriptionId from
    // the request — cancelling always acts on the SESSION's own org, so
    // "attacking" it can only ever cancel org A's own subscription, never
    // org B's. Confirm org B's subscription is untouched.
    const cancelRes = await context.request.post("/api/merchant/subscription/cancel");
    expect(cancelRes.ok()).toBeTruthy(); // canceled org A's OWN subscription
    const orgBAfterCancelAttempt = await prisma.wgcSubscription.findUniqueOrThrow({ where: { id: orgBSubscription.id } });
    expect(orgBAfterCancelAttempt.status).toBe("ACTIVE");

    // 2. Viewing the subscription page only ever renders the session's own
    // org's data — no orgId can be passed to influence it. Confirm org B's
    // name/amount never appears while logged in as org A.
    await page.goto("/merchant/subscription");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(orgB.church.name);

    // 3. Org B's billing activation token must be rejected when presented
    // by an org A session — resolveBillingActivationToken().organizationId
    // must equal auth.churchId, or the API returns 403.
    const orgBActivationToken = await createBillingActivationToken(orgB.church.id);
    const activateRes = await context.request.post("/api/billing/activate", {
      data: { token: orgBActivationToken, financeInstrumentToken: "TKfake", paymentMethodType: "card", authorizationAccepted: true },
    });
    expect(activateRes.status()).toBe(403);
    const orgBSubAfterActivateAttempt = await prisma.wgcSubscription.findUnique({ where: { organizationId: orgB.church.id } });
    expect(orgBSubAfterActivateAttempt?.status).toBe("ACTIVE"); // unchanged, no new billing account created for org A on org B

    // 4. Admin-only free-month grant endpoint must reject a plain merchant
    // session outright (401/403), regardless of which org it targets.
    const grantRes = await context.request.post(`/api/admin/billing/organizations/${orgB.church.id}/grant-free-months`, {
      data: { months: 3, internalReason: "attack attempt", customerFacingExplanation: "x", confirmed: true },
    });
    expect([401, 403]).toContain(grantRes.status());
  });
});
