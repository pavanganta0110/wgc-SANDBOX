import { test, expect } from "@playwright/test";
import { prisma, seedOrgWithOwner, seedWgcSubscription, cleanupOrg } from "./fixtures/db";
import { buildSubscriptionChargePayload, buildFinixWebhookHeaders } from "./fixtures/finixWebhook";

/**
 * Journey 8: failed payment — a Finix webhook reporting a failed
 * subscription charge (a TRANSFER event carrying data.subscription /
 * data.state, per src/lib/billing/wgcSubscriptionWebhook.ts) moves
 * WgcSubscription.status to PAST_DUE and sets gracePeriodEndsAt.
 */
test.describe("Failed subscription payment webhook", () => {
  let churchId: string | null = null;

  test.afterEach(async () => {
    await cleanupOrg(churchId);
  });

  test("a failed charge webhook sets status=PAST_DUE and a future gracePeriodEndsAt", async ({ request }) => {
    const { church } = await seedOrgWithOwner({ namePrefix: "FailedPaymentOrg", billingSetupStatus: "BILLING_ACTIVE" });
    churchId = church.id;
    const subscription = await seedWgcSubscription({ organizationId: church.id, status: "ACTIVE", amountCents: 1000 });

    const payload = buildSubscriptionChargePayload({
      finixSubscriptionId: subscription.finixSubscriptionId!,
      succeeded: false,
      amountCents: 1000,
    });
    const rawBody = JSON.stringify(payload);

    const res = await request.post("/api/webhooks/finix", {
      data: rawBody,
      headers: buildFinixWebhookHeaders(rawBody),
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const updated = await prisma.wgcSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(updated.status).toBe("PAST_DUE");
    expect(updated.pastDueAt).toBeTruthy();
    expect(updated.gracePeriodEndsAt).toBeTruthy();
    expect(updated.gracePeriodEndsAt!.getTime()).toBeGreaterThan(Date.now());

    const charge = await prisma.billingCharge.findFirst({ where: { organizationId: church.id, status: "FAILED" } });
    expect(charge).toBeTruthy();
    expect(charge!.amountCents).toBe(1000);

    const auditEntries = await prisma.wgcBillingAuditLog.findMany({ where: { organizationId: church.id } });
    expect(auditEntries.some((e) => e.action === "subscription.past_due")).toBe(true);
  });

  test("a duplicate/replayed failed-charge webhook does not create a second BillingCharge", async ({ request }) => {
    const { church } = await seedOrgWithOwner({ namePrefix: "FailedPaymentDupeOrg", billingSetupStatus: "BILLING_ACTIVE" });
    churchId = church.id;
    const subscription = await seedWgcSubscription({ organizationId: church.id, status: "ACTIVE", amountCents: 1000 });

    const payload = buildSubscriptionChargePayload({ finixSubscriptionId: subscription.finixSubscriptionId!, succeeded: false });
    const rawBody = JSON.stringify(payload);
    const headers1 = buildFinixWebhookHeaders(rawBody);
    await request.post("/api/webhooks/finix", { data: rawBody, headers: headers1 });

    // Replay with a different event id but the SAME underlying transfer id
    // — the route dedups by idempotencyKey (org + chargeType + transferId),
    // not by Finix event id, for exactly this "at-least-once delivery"
    // case.
    const replayPayload = { ...payload, id: `evt_e2e_replay_${Date.now()}` };
    const replayRawBody = JSON.stringify(replayPayload);
    await request.post("/api/webhooks/finix", { data: replayRawBody, headers: buildFinixWebhookHeaders(replayRawBody) });

    const charges = await prisma.billingCharge.findMany({ where: { organizationId: church.id } });
    expect(charges.length).toBe(1);
  });
});
