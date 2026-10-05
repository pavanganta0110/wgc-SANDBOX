import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEmitEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/events/emitEvent", () => ({ emitEvent: mockEmitEvent }));

const mockPrisma = { payment: { findFirst: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function payment(overrides: Partial<{ id: string; churchId: string; donorId: string | null; finixSubscriptionId: string | null; status: string; createdAt: Date }> = {}) {
  return {
    id: "pay1",
    churchId: "church-a",
    donorId: "donor1",
    finixSubscriptionId: "sub1",
    status: "SUCCEEDED",
    createdAt: new Date("2026-02-01"),
    ...overrides,
  };
}

describe("emitRecurringPaymentOutcomeEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing for a payment not tied to any subscription", async () => {
    const { emitRecurringPaymentOutcomeEvent } = await import("../recurringPaymentEvents");
    await emitRecurringPaymentOutcomeEvent(payment({ finixSubscriptionId: null }));

    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("emits recurring.payment_failed for a FAILED recurring charge", async () => {
    const { emitRecurringPaymentOutcomeEvent } = await import("../recurringPaymentEvents");
    await emitRecurringPaymentOutcomeEvent(payment({ status: "FAILED" }));

    expect(mockEmitEvent).toHaveBeenCalledWith({
      type: "recurring.payment_failed",
      churchId: "church-a",
      data: { paymentId: "pay1", donorId: "donor1", finixSubscriptionId: "sub1" },
    });
  });

  it("does NOT emit recovered for a normal first successful charge (no prior failure)", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    const { emitRecurringPaymentOutcomeEvent } = await import("../recurringPaymentEvents");
    await emitRecurringPaymentOutcomeEvent(payment({ status: "SUCCEEDED" }));

    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("emits recurring.payment_recovered when a prior FAILED payment exists on the same subscription", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue({ id: "pay0" });
    const { emitRecurringPaymentOutcomeEvent } = await import("../recurringPaymentEvents");
    await emitRecurringPaymentOutcomeEvent(payment({ status: "SUCCEEDED" }));

    expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { finixSubscriptionId: "sub1", status: "FAILED", createdAt: { lt: payment().createdAt } } })
    );
    expect(mockEmitEvent).toHaveBeenCalledWith({
      type: "recurring.payment_recovered",
      churchId: "church-a",
      data: { paymentId: "pay1", donorId: "donor1", finixSubscriptionId: "sub1" },
    });
  });

  it("does nothing for a non-terminal (e.g. PENDING) status", async () => {
    const { emitRecurringPaymentOutcomeEvent } = await import("../recurringPaymentEvents");
    await emitRecurringPaymentOutcomeEvent(payment({ status: "PENDING" }));

    expect(mockEmitEvent).not.toHaveBeenCalled();
    expect(mockPrisma.payment.findFirst).not.toHaveBeenCalled();
  });
});
