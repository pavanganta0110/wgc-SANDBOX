import { test, expect } from "@playwright/test";
import { prisma, cleanupOnboardingApplication, randomSuffix } from "./fixtures/db";
import { buildMerchantApprovedPayload, buildFinixWebhookHeaders } from "./fixtures/finixWebhook";

/**
 * Journey 3: Finix approval simulation, isolated from the full onboarding
 * form journey (see spec 01/02) — seeds an OnboardingApplication directly
 * (representing one already submitted and under review), then POSTs a
 * realistic merchant.updated/APPROVED webhook payload (shape confirmed
 * against src/app/api/webhooks/finix/route.ts's own getFinixEventData()
 * parsing — entity/type/data, never invented field names) and verifies
 * Church.billingSetupStatus transitions to APPROVED_BILLING_REQUIRED, plus
 * the billing-activation gate side effects (activation token, audit log).
 */
test.describe("Finix approval webhook simulation", () => {
  let applicationId: string;

  test.beforeEach(async () => {
    const suffix = randomSuffix();
    const application = await prisma.onboardingApplication.create({
      data: {
        organizationName: `E2E Webhook Approval Org ${suffix}`,
        organizationType: "Nonprofit",
        contactName: "E2E Contact",
        contactEmail: `webhook-approval+${suffix}@e2e.wgcpayments.test`,
        status: "SUBMITTED",
        onboardingStatus: "UNDER_REVIEW",
        finixMerchantId: `MU_e2e_${suffix}`,
        finixIdentityId: `ID_e2e_${suffix}`,
        legalBusinessName: `E2E Webhook Approval Org ${suffix}`,
      },
    });
    applicationId = application.id;
  });

  test.afterEach(async () => {
    await cleanupOnboardingApplication(applicationId);
  });

  test("merchant.updated APPROVED webhook transitions Church.billingSetupStatus to APPROVED_BILLING_REQUIRED", async ({ request }) => {
    const application = await prisma.onboardingApplication.findUniqueOrThrow({ where: { id: applicationId } });

    const payload = buildMerchantApprovedPayload({ finixMerchantId: application.finixMerchantId! });
    const rawBody = JSON.stringify(payload);

    const res = await request.post("/api/webhooks/finix", {
      data: rawBody,
      headers: buildFinixWebhookHeaders(rawBody),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const updatedApplication = await prisma.onboardingApplication.findUniqueOrThrow({ where: { id: applicationId } });
    expect(updatedApplication.onboardingStatus).toBe("APPROVED");
    expect(updatedApplication.processingEnabled).toBe(true);
    expect(updatedApplication.settlementEnabled).toBe(true);

    const church = await prisma.church.findFirst({ where: { onboardingApplicationId: applicationId } });
    expect(church, "Church row should be provisioned on approval").toBeTruthy();
    expect(church!.billingSetupStatus).toBe("APPROVED_BILLING_REQUIRED");
    expect(church!.finixMerchantId).toBe(application.finixMerchantId);

    // Side effects of the billing-activation gate set up in the same
    // webhook handler (see route.ts's "WGC platform-billing gate" block).
    const activationToken = await prisma.billingActivationToken.findFirst({ where: { organizationId: church!.id } });
    expect(activationToken, "a billing activation token should be created").toBeTruthy();

    const auditEntries = await prisma.wgcBillingAuditLog.findMany({ where: { organizationId: church!.id } });
    expect(auditEntries.some((e) => e.action === "organization.finix_approved")).toBe(true);
    expect(auditEntries.some((e) => e.action === "billing.activation_link_created")).toBe(true);

    // Idempotency: replaying the same event id must not double-process.
    const replayRes = await request.post("/api/webhooks/finix", {
      data: rawBody,
      headers: buildFinixWebhookHeaders(rawBody),
    });
    expect(replayRes.ok()).toBeTruthy();
    const replayBody = await replayRes.json();
    expect(replayBody.message).toBe("Already processed");

    const auditEntriesAfterReplay = await prisma.wgcBillingAuditLog.findMany({ where: { organizationId: church!.id } });
    expect(auditEntriesAfterReplay.length).toBe(auditEntries.length);
  });
});
