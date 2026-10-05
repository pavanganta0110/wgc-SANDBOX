import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/webhooks/encryption", () => ({
  decryptSecret: vi.fn().mockReturnValue("whsec_test123"),
  deserializeEnvelope: vi.fn().mockReturnValue({ version: "v1", iv: "x", authTag: "y", ciphertext: "z" }),
}));

const mockPrisma = {
  webhookDelivery: { findUnique: vi.fn(), update: vi.fn() },
  webhookEvent: { findUnique: vi.fn() },
  webhookEndpoint: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const baseEvent = { id: "evt1", churchId: "church-a", type: "donation.created", dataJson: { amount: 100 }, createdAt: new Date() };
const baseEndpoint = {
  id: "ep1",
  churchId: "church-a",
  url: "https://example.com/hook",
  status: "ACTIVE",
  signingSecretEncrypted: "encrypted-blob",
  consecutiveFailures: 0,
};
const baseDelivery = { id: "del1", webhookEventId: "evt1", webhookEndpointId: "ep1", churchId: "church-a", status: "PENDING", attemptCount: 0 };

describe("attemptWebhookDelivery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.webhookDelivery.findUnique.mockResolvedValue(baseDelivery);
    mockPrisma.webhookEvent.findUnique.mockResolvedValue(baseEvent);
    mockPrisma.webhookEndpoint.findUnique.mockResolvedValue(baseEndpoint);
    global.fetch = vi.fn();
  });

  it("marks the delivery SUCCEEDED and resets the endpoint's failure count on a 2xx response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("ok") });

    const { attemptWebhookDelivery } = await import("../deliverWebhook");
    await attemptWebhookDelivery("del1");

    const deliveryUpdateCall = mockPrisma.webhookDelivery.update.mock.calls[0][0];
    expect(deliveryUpdateCall.data.status).toBe("SUCCEEDED");
    expect(deliveryUpdateCall.data.responseStatusCode).toBe(200);

    const endpointUpdateCall = mockPrisma.webhookEndpoint.update.mock.calls[0][0];
    expect(endpointUpdateCall.data.consecutiveFailures).toBe(0);

    global.fetch = originalFetch;
  });

  it("sends the HMAC signature and event metadata as headers", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("") });

    const { attemptWebhookDelivery } = await import("../deliverWebhook");
    await attemptWebhookDelivery("del1");

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(options.method).toBe("POST");
    expect(options.headers["WGC-Signature"]).toMatch(/^timestamp=\d+,sig=[0-9a-f]+$/);
    expect(options.headers["WGC-Event-Id"]).toBe("evt1");
    expect(options.headers["WGC-Event-Type"]).toBe("donation.created");

    global.fetch = originalFetch;
  });

  it("marks the delivery FAILED with a nextRetryAt when the endpoint returns a non-2xx and attempts remain", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("server error") });

    const { attemptWebhookDelivery } = await import("../deliverWebhook");
    await attemptWebhookDelivery("del1");

    const deliveryUpdateCall = mockPrisma.webhookDelivery.update.mock.calls[0][0];
    expect(deliveryUpdateCall.data.status).toBe("FAILED");
    expect(deliveryUpdateCall.data.nextRetryAt).toBeInstanceOf(Date);
    expect(deliveryUpdateCall.data.responseStatusCode).toBe(500);

    global.fetch = originalFetch;
  });

  it("marks the delivery ABANDONED once retries are exhausted (no nextRetryAt)", async () => {
    mockPrisma.webhookDelivery.findUnique.mockResolvedValue({ ...baseDelivery, attemptCount: 5 }); // 6th attempt = MAX_DELIVERY_ATTEMPTS
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("") });

    const { attemptWebhookDelivery } = await import("../deliverWebhook");
    await attemptWebhookDelivery("del1");

    const deliveryUpdateCall = mockPrisma.webhookDelivery.update.mock.calls[0][0];
    expect(deliveryUpdateCall.data.status).toBe("ABANDONED");
    expect(deliveryUpdateCall.data.nextRetryAt).toBeNull();

    global.fetch = originalFetch;
  });

  it("auto-disables the endpoint once consecutive failures cross the threshold", async () => {
    mockPrisma.webhookEndpoint.findUnique.mockResolvedValue({ ...baseEndpoint, consecutiveFailures: 19 });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("") });

    const { attemptWebhookDelivery } = await import("../deliverWebhook");
    await attemptWebhookDelivery("del1");

    const endpointUpdateCall = mockPrisma.webhookEndpoint.update.mock.calls[0][0];
    expect(endpointUpdateCall.data.status).toBe("DISABLED_AUTO");
    expect(endpointUpdateCall.data.consecutiveFailures).toBe(20);

    global.fetch = originalFetch;
  });

  it("records a timeout as a failed attempt rather than throwing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const { attemptWebhookDelivery } = await import("../deliverWebhook");
    await expect(attemptWebhookDelivery("del1")).resolves.not.toThrow();

    const deliveryUpdateCall = mockPrisma.webhookDelivery.update.mock.calls[0][0];
    expect(deliveryUpdateCall.data.status).toBe("FAILED");
    expect(deliveryUpdateCall.data.errorMessage).toBe("Request timed out");

    global.fetch = originalFetch;
  });

  it("is a no-op for a delivery that's already SUCCEEDED or ABANDONED (never re-delivers)", async () => {
    mockPrisma.webhookDelivery.findUnique.mockResolvedValue({ ...baseDelivery, status: "SUCCEEDED" });

    const { attemptWebhookDelivery } = await import("../deliverWebhook");
    await attemptWebhookDelivery("del1");

    expect(global.fetch).not.toHaveBeenCalled();
    global.fetch = originalFetch;
  });

  it("abandons delivery immediately (without attempting a request) when the endpoint is no longer ACTIVE", async () => {
    mockPrisma.webhookEndpoint.findUnique.mockResolvedValue({ ...baseEndpoint, status: "DISABLED" });

    const { attemptWebhookDelivery } = await import("../deliverWebhook");
    await attemptWebhookDelivery("del1");

    expect(global.fetch).not.toHaveBeenCalled();
    const deliveryUpdateCall = mockPrisma.webhookDelivery.update.mock.calls[0][0];
    expect(deliveryUpdateCall.data.status).toBe("ABANDONED");

    global.fetch = originalFetch;
  });
});
