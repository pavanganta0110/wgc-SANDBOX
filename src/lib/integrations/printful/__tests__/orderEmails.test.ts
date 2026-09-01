import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendWgcEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendWgcEmail: mockSendWgcEmail }));

const mockNotifyEvent = vi.fn();
vi.mock("@/lib/settings/notificationDispatch", () => ({ notifyEvent: mockNotifyEvent }));

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));

const mockPrisma = {
  merchandiseOrder: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
  emailLog: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../orderEmails");
}

const baseOrder = {
  id: "order-1",
  churchId: "church-1",
  wgcOrderNumber: "WGC-MERCH-ABCD1234",
  customerEmail: "donor@example.com",
  shippingName: "Jane Donor",
  shippingAddress1: "123 Main St",
  shippingAddress2: null,
  shippingCity: "Austin",
  shippingState: "TX",
  shippingPostalCode: "78701",
  shippingCountry: "US",
  shippingAmount: 500,
  totalMerchandiseAmount: 4500,
  items: [{ productName: "T-Shirt", variantName: "Large / Blue", quantity: 2, lineTotal: 4000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.merchandiseOrder.findUnique.mockResolvedValue(baseOrder);
  mockPrisma.church.findUnique.mockResolvedValue({ name: "First Community Church" });
  mockSendWgcEmail.mockResolvedValue({ success: true });
  mockPrisma.emailLog.create.mockResolvedValue({});
});

describe("sendMerchandiseOrderConfirmation", () => {
  it("sends a confirmation to the donor's email with order details", async () => {
    const { sendMerchandiseOrderConfirmation } = await load();
    await sendMerchandiseOrderConfirmation("order-1");

    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "donor@example.com",
        subject: expect.stringContaining("WGC-MERCH-ABCD1234"),
      })
    );
    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("T-Shirt");
    expect(call.bodyHtml).toContain("Large / Blue");
  });

  it("logs the send attempt to EmailLog", async () => {
    const { sendMerchandiseOrderConfirmation } = await load();
    await sendMerchandiseOrderConfirmation("order-1");

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "MERCHANDISE_ORDER_CONFIRMATION", status: "SENT" }) })
    );
  });

  it("returns without sending when the order has no customer email", async () => {
    mockPrisma.merchandiseOrder.findUnique.mockResolvedValue({ ...baseOrder, customerEmail: null });
    const { sendMerchandiseOrderConfirmation } = await load();
    const result = await sendMerchandiseOrderConfirmation("order-1");

    expect(result.success).toBe(false);
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });

  it("throws if the order does not exist", async () => {
    mockPrisma.merchandiseOrder.findUnique.mockResolvedValue(null);
    const { sendMerchandiseOrderConfirmation } = await load();
    await expect(sendMerchandiseOrderConfirmation("missing")).rejects.toThrow("Order not found");
  });
});

describe("notifyNewMerchandiseOrder", () => {
  it("routes through notifyEvent with the NEW_MERCHANDISE_ORDER event key", async () => {
    const { notifyNewMerchandiseOrder } = await load();
    await notifyNewMerchandiseOrder("order-1");

    expect(mockNotifyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId: "church-1",
        eventKey: "NEW_MERCHANDISE_ORDER",
        subject: expect.stringContaining("WGC-MERCH-ABCD1234"),
      })
    );
  });

  it("no-ops silently when the order does not exist", async () => {
    mockPrisma.merchandiseOrder.findUnique.mockResolvedValue(null);
    const { notifyNewMerchandiseOrder } = await load();
    await expect(notifyNewMerchandiseOrder("missing")).resolves.toBeUndefined();
    expect(mockNotifyEvent).not.toHaveBeenCalled();
  });
});
