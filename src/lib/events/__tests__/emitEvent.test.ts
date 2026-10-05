import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/webhooks/deliverWebhook", () => ({ attemptWebhookDelivery: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = {
  webhookEvent: { create: vi.fn() },
  webhookEndpoint: { findMany: vi.fn() },
  webhookDelivery: { create: vi.fn() },
  $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("emitEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.webhookEvent.create.mockResolvedValue({ id: "evt1", churchId: "church-a", type: "donation.created" });
  });

  it("always persists a durable WebhookEvent row, even with zero subscribed endpoints", async () => {
    mockPrisma.webhookEndpoint.findMany.mockResolvedValue([]);

    const { emitEvent } = await import("../emitEvent");
    await emitEvent({ type: "donation.created", churchId: "church-a", data: { amount: 100 } });

    expect(mockPrisma.webhookEvent.create).toHaveBeenCalledWith({
      data: { churchId: "church-a", type: "donation.created", dataJson: { amount: 100 } },
    });
    expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
  });

  it("creates a delivery only for endpoints actually subscribed to this event type", async () => {
    mockPrisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep-subscribed", subscribedEventsJson: ["donation.created", "donation.refunded"] },
      { id: "ep-not-subscribed", subscribedEventsJson: ["invoice.paid"] },
    ]);

    const { emitEvent } = await import("../emitEvent");
    await emitEvent({ type: "donation.created", churchId: "church-a", data: {} });

    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: { webhookEventId: "evt1", webhookEndpointId: "ep-subscribed", churchId: "church-a" },
    });
  });

  it("only queries ACTIVE endpoints for this church (tenant isolation + status gate)", async () => {
    mockPrisma.webhookEndpoint.findMany.mockResolvedValue([]);

    const { emitEvent } = await import("../emitEvent");
    await emitEvent({ type: "donor.created", churchId: "church-a", data: {} });

    expect(mockPrisma.webhookEndpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-a", status: "ACTIVE" } })
    );
  });

  it("never throws even when the database call fails", async () => {
    mockPrisma.webhookEvent.create.mockRejectedValue(new Error("db down"));

    const { emitEvent } = await import("../emitEvent");
    await expect(emitEvent({ type: "donation.created", churchId: "church-a", data: {} })).resolves.toBeUndefined();
  });
});
