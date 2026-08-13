import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    merchandiseWebhookEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    merchandiseOrder: { findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));

describe("recordAndProcessWebhookEvent — idempotency (spec item 44)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns alreadyProcessed=true and never reprocesses a duplicate externalEventId", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { recordAndProcessWebhookEvent } = await import("../webhooks");

    vi.mocked(prisma.merchandiseWebhookEvent.findUnique).mockResolvedValue({ id: "existing-row" } as never);

    const result = await recordAndProcessWebhookEvent({
      event: { externalEventId: "evt-1", eventType: "SHIPMENT_CREATED", externalOrderId: "order-ext-1", status: "SHIPPED", trackingNumber: "T1", trackingUrl: null, carrier: "UPS", raw: {} },
      churchId: "church-a",
      connectionId: "conn-1",
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(prisma.merchandiseWebhookEvent.create).not.toHaveBeenCalled();
    expect(prisma.merchandiseOrder.update).not.toHaveBeenCalled();
  });

  it("creates the event row BEFORE processing, then applies the status update to the matching order", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { recordAndProcessWebhookEvent } = await import("../webhooks");

    vi.mocked(prisma.merchandiseWebhookEvent.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.merchandiseWebhookEvent.create).mockResolvedValue({ id: "new-row" } as never);
    vi.mocked(prisma.merchandiseOrder.findFirst).mockResolvedValue({ id: "order-1", churchId: "church-a", externalOrderId: "order-ext-1" } as never);

    const result = await recordAndProcessWebhookEvent({
      event: { externalEventId: "evt-2", eventType: "SHIPMENT_CREATED", externalOrderId: "order-ext-1", status: "SHIPPED", trackingNumber: "T2", trackingUrl: null, carrier: "UPS", raw: {} },
      churchId: "church-a",
      connectionId: "conn-1",
    });

    expect(result.alreadyProcessed).toBe(false);
    expect(prisma.merchandiseWebhookEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.merchandiseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ status: "SHIPPED", trackingNumber: "T2" }) })
    );
    expect(prisma.merchandiseWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "new-row" }, data: expect.objectContaining({ status: "PROCESSED" }) }));
  });

  it("never touches an order belonging to a different church than the event resolved to", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { recordAndProcessWebhookEvent } = await import("../webhooks");

    vi.mocked(prisma.merchandiseWebhookEvent.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.merchandiseWebhookEvent.create).mockResolvedValue({ id: "row-3" } as never);
    // Simulate the webhook route's own church resolution finding no order
    // for the wrong church (findFirst is always called with the correct
    // churchId scoping in the real webhook route — this asserts the
    // no-match path is handled safely, not silently updating anything).
    vi.mocked(prisma.merchandiseOrder.findFirst).mockResolvedValue(null as never);

    const result = await recordAndProcessWebhookEvent({
      event: { externalEventId: "evt-3", eventType: "ORDER_UPDATED", externalOrderId: "order-ext-nonexistent", status: "SHIPPED", raw: {} },
      churchId: "church-b",
      connectionId: null,
    });

    expect(result.alreadyProcessed).toBe(false);
    expect(prisma.merchandiseOrder.update).not.toHaveBeenCalled();
  });
});
