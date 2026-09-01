import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendShipmentNotification = vi.fn();
vi.mock("../orderEmails", () => ({ sendShipmentNotification: mockSendShipmentNotification }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));

const mockPrisma = {
  merchandiseWebhookEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  merchandiseOrder: { findFirst: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../webhooks");
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return { id: "order-1", churchId: "church-1", wgcOrderNumber: "WGC-MERCH-ABCD1234", trackingNumber: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.merchandiseWebhookEvent.findUnique.mockResolvedValue(null);
  mockPrisma.merchandiseWebhookEvent.create.mockResolvedValue({ id: "event-1" });
  mockPrisma.merchandiseWebhookEvent.update.mockResolvedValue({});
  mockPrisma.merchandiseOrder.update.mockResolvedValue({});
  mockSendShipmentNotification.mockResolvedValue({ success: true });
});

describe("Printful webhook — shipment notification email", () => {
  it("sends the shipment email the first time a tracking number appears", async () => {
    mockPrisma.merchandiseOrder.findFirst.mockResolvedValue(baseOrder({ trackingNumber: null }));
    const { recordAndProcessWebhookEvent } = await load();

    await recordAndProcessWebhookEvent({
      event: { externalEventId: "evt-1", eventType: "SHIPMENT_CREATED", externalOrderId: "ext-1", status: "SHIPPED", trackingNumber: "1Z999", trackingUrl: "https://track.example/1Z999", carrier: "UPS", raw: {} },
      churchId: "church-1",
      connectionId: "conn-1",
    });

    expect(mockSendShipmentNotification).toHaveBeenCalledWith("order-1");
  });

  it("does not re-send the shipment email when the order already had a tracking number", async () => {
    mockPrisma.merchandiseOrder.findFirst.mockResolvedValue(baseOrder({ trackingNumber: "1Z999" }));
    const { recordAndProcessWebhookEvent } = await load();

    // e.g. a later "delivered" webhook that still echoes the same tracking number
    await recordAndProcessWebhookEvent({
      event: { externalEventId: "evt-2", eventType: "ORDER_UPDATED", externalOrderId: "ext-1", status: "DELIVERED", trackingNumber: "1Z999", trackingUrl: "https://track.example/1Z999", carrier: "UPS", raw: {} },
      churchId: "church-1",
      connectionId: "conn-1",
    });

    expect(mockSendShipmentNotification).not.toHaveBeenCalled();
  });

  it("does not send the shipment email when the event carries no tracking number", async () => {
    mockPrisma.merchandiseOrder.findFirst.mockResolvedValue(baseOrder({ trackingNumber: null }));
    const { recordAndProcessWebhookEvent } = await load();

    await recordAndProcessWebhookEvent({
      event: { externalEventId: "evt-3", eventType: "FULFILLMENT_STARTED", externalOrderId: "ext-1", status: "IN_FULFILLMENT", trackingNumber: null, trackingUrl: null, carrier: null, raw: {} },
      churchId: "church-1",
      connectionId: "conn-1",
    });

    expect(mockSendShipmentNotification).not.toHaveBeenCalled();
  });

  it("never throws back to the caller when the shipment email fails", async () => {
    mockPrisma.merchandiseOrder.findFirst.mockResolvedValue(baseOrder({ trackingNumber: null }));
    mockSendShipmentNotification.mockRejectedValue(new Error("Resend down"));
    const { recordAndProcessWebhookEvent } = await load();

    const result = await recordAndProcessWebhookEvent({
      event: { externalEventId: "evt-4", eventType: "SHIPMENT_CREATED", externalOrderId: "ext-1", status: "SHIPPED", trackingNumber: "1Z999", trackingUrl: null, carrier: null, raw: {} },
      churchId: "church-1",
      connectionId: "conn-1",
    });

    expect(result.alreadyProcessed).toBe(false);
    expect(result.error).toBeUndefined();
  });
});
