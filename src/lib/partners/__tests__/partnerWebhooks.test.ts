import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  church: { findUnique: vi.fn() },
  partnerWebhookEndpoint: { findUnique: vi.fn(), update: vi.fn() },
  partnerWebhookDelivery: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  webhookEvent: { findUnique: vi.fn() },
  $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/webhooks/encryption", () => ({ decryptSecret: () => "whsec_test", deserializeEnvelope: (x: string) => x }));
const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/webhooks/postSignedWebhook", () => ({ postSignedWebhook: post }));

import { attemptPartnerWebhookDelivery, queuePartnerWebhookDelivery, sendPartnerTestEvent } from "../partnerWebhooks";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.partnerWebhookDelivery.create.mockResolvedValue({ id: "d1" });
  prismaMock.partnerWebhookDelivery.findUnique.mockResolvedValue(null); // the background attempt exits early
});

describe("queuePartnerWebhookDelivery", () => {
  const params = { eventId: "evt1", type: "donation.created", churchId: "c1" };

  it("does nothing for an organization with no partner", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ partnerId: null });
    await queuePartnerWebhookDelivery(params);
    expect(prismaMock.partnerWebhookEndpoint.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.partnerWebhookDelivery.create).not.toHaveBeenCalled();
  });

  it("does nothing when the partner has no endpoint, or it is turned off, or not subscribed", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ partnerId: "p1" });

    prismaMock.partnerWebhookEndpoint.findUnique.mockResolvedValue(null);
    await queuePartnerWebhookDelivery(params);

    prismaMock.partnerWebhookEndpoint.findUnique.mockResolvedValue({ id: "w1", status: "DISABLED_AUTO", subscribedEventsJson: ["donation.created"] });
    await queuePartnerWebhookDelivery(params);

    prismaMock.partnerWebhookEndpoint.findUnique.mockResolvedValue({ id: "w1", status: "ACTIVE", subscribedEventsJson: ["donor.created"] });
    await queuePartnerWebhookDelivery(params);

    expect(prismaMock.partnerWebhookDelivery.create).not.toHaveBeenCalled();
  });

  it("queues a delivery for the partner of the organization the event happened in", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ partnerId: "p1" });
    prismaMock.partnerWebhookEndpoint.findUnique.mockResolvedValue({ id: "w1", status: "ACTIVE", subscribedEventsJson: ["donation.created"] });
    await queuePartnerWebhookDelivery(params);
    expect(prismaMock.partnerWebhookEndpoint.findUnique.mock.calls[0][0].where).toEqual({ partnerId: "p1" });
    expect(prismaMock.partnerWebhookDelivery.create).toHaveBeenCalledWith({
      data: { webhookEventId: "evt1", partnerId: "p1", partnerEndpointId: "w1", churchId: "c1" },
    });
  });

  it("never throws", async () => {
    prismaMock.church.findUnique.mockRejectedValue(new Error("db down"));
    await expect(queuePartnerWebhookDelivery(params)).resolves.toBeUndefined();
  });
});

describe("attemptPartnerWebhookDelivery", () => {
  const delivery = { id: "d1", status: "PENDING", attemptCount: 0, webhookEventId: "evt1", partnerEndpointId: "w1", partnerId: "p1", churchId: "c1" };
  const event = { id: "evt1", type: "donation.created", createdAt: new Date("2026-01-02T00:00:00Z"), dataJson: { amountCents: 1000 } };
  const endpoint = { id: "w1", partnerId: "p1", status: "ACTIVE", url: "https://hooks.example.com/x", signingSecretEncrypted: "enc", consecutiveFailures: 0 };
  const church = { id: "c1", name: "Grace", partnerId: "p1", partnerReference: "loc_1" };

  beforeEach(() => {
    prismaMock.partnerWebhookDelivery.findUnique.mockResolvedValue(delivery);
    prismaMock.webhookEvent.findUnique.mockResolvedValue(event);
    prismaMock.partnerWebhookEndpoint.findUnique.mockResolvedValue(endpoint);
    prismaMock.church.findUnique.mockResolvedValue(church);
    prismaMock.partnerWebhookDelivery.update.mockResolvedValue({});
    prismaMock.partnerWebhookEndpoint.update.mockResolvedValue({});
  });

  it("sends the event tagged with the organization and records success", async () => {
    post.mockResolvedValue({ ok: true, statusCode: 200, bodySnippet: "ok", timestamp: 1 });
    await attemptPartnerWebhookDelivery("d1");

    const sent = post.mock.calls[0][0];
    expect(sent.url).toBe("https://hooks.example.com/x");
    expect(sent.secret).toBe("whsec_test");
    expect(JSON.parse(sent.rawBody)).toEqual({
      id: "evt1",
      type: "donation.created",
      createdAt: "2026-01-02T00:00:00.000Z",
      organization: { id: "c1", name: "Grace", reference: "loc_1" },
      data: { amountCents: 1000 },
    });
    expect(prismaMock.partnerWebhookDelivery.update.mock.calls[0][0].data).toMatchObject({ status: "SUCCEEDED", attemptCount: 1, responseStatusCode: 200 });
    expect(prismaMock.partnerWebhookEndpoint.update.mock.calls[0][0].data).toMatchObject({ consecutiveFailures: 0 });
  });

  it("records a failure with a retry time and counts it against the endpoint", async () => {
    post.mockResolvedValue({ ok: false, statusCode: 500, error: "HTTP 500", timestamp: 1 });
    await attemptPartnerWebhookDelivery("d1");
    const data = prismaMock.partnerWebhookDelivery.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "FAILED", attemptCount: 1, errorMessage: "HTTP 500" });
    expect(data.nextRetryAt).toBeInstanceOf(Date);
    expect(prismaMock.partnerWebhookEndpoint.update.mock.calls[0][0].data).toMatchObject({ consecutiveFailures: 1 });
  });

  it("turns the endpoint off after too many failures in a row", async () => {
    prismaMock.partnerWebhookEndpoint.findUnique.mockResolvedValue({ ...endpoint, consecutiveFailures: 19 });
    post.mockResolvedValue({ ok: false, error: "timeout", timestamp: 1 });
    await attemptPartnerWebhookDelivery("d1");
    expect(prismaMock.partnerWebhookEndpoint.update.mock.calls[0][0].data).toMatchObject({ status: "DISABLED_AUTO", consecutiveFailures: 20 });
  });

  it("gives up instead of sending when the organization is no longer the partner's", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ ...church, partnerId: "someone-else" });
    await attemptPartnerWebhookDelivery("d1");
    expect(post).not.toHaveBeenCalled();
    expect(prismaMock.partnerWebhookDelivery.update.mock.calls[0][0].data.status).toBe("ABANDONED");
  });

  it("skips a delivery that already succeeded", async () => {
    prismaMock.partnerWebhookDelivery.findUnique.mockResolvedValue({ ...delivery, status: "SUCCEEDED" });
    await attemptPartnerWebhookDelivery("d1");
    expect(post).not.toHaveBeenCalled();
  });
});

describe("sendPartnerTestEvent", () => {
  it("reports when no webhook exists", async () => {
    prismaMock.partnerWebhookEndpoint.findUnique.mockResolvedValue(null);
    expect(await sendPartnerTestEvent("p1")).toEqual({ ok: false, error: "No webhook is set up yet." });
  });

  it("sends a signed webhook.test event and reports the result", async () => {
    prismaMock.partnerWebhookEndpoint.findUnique.mockResolvedValue({ id: "w1", url: "https://hooks.example.com/x", signingSecretEncrypted: "enc" });
    prismaMock.partnerWebhookEndpoint.update.mockResolvedValue({});
    post.mockResolvedValue({ ok: true, statusCode: 204, timestamp: 1 });
    const result = await sendPartnerTestEvent("p1");
    expect(result).toEqual({ ok: true, statusCode: 204, error: undefined });
    expect(post.mock.calls[0][0].eventType).toBe("webhook.test");
    expect(JSON.parse(post.mock.calls[0][0].rawBody).type).toBe("webhook.test");
  });
});
