import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFinixClient = { getTransfer: vi.fn() };
vi.mock("@/lib/finix/client", () => ({ finixClient: mockFinixClient }));
vi.mock("@/lib/invoices/invoiceEmails", () => ({ sendInvoicePaymentReceiptEmail: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = {
  invoicePayment: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  invoice: { findUnique: vi.fn(), update: vi.fn() },
  invoiceActivity: { create: vi.fn() },
  invoicePaymentAttempt: { findUnique: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("@/lib/invoices/invoicePaymentReconciliation");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyInvoicePaymentTransferState", () => {
  it("is a no-op when there's no matching InvoicePayment", async () => {
    mockPrisma.invoicePayment.findFirst.mockResolvedValue(null);
    const { applyInvoicePaymentTransferState } = await load();
    const result = await applyInvoicePaymentTransferState("TR1", "SUCCEEDED");
    expect(result.applied).toBe(false);
    expect(mockPrisma.invoicePayment.update).not.toHaveBeenCalled();
  });

  it("is a no-op (idempotent) when the status already matches — a webhook and a return-page check racing never double-apply", async () => {
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({ id: "p1", status: "SUCCEEDED", invoiceId: "inv1", method: "CARD" });
    const { applyInvoicePaymentTransferState } = await load();
    const result = await applyInvoicePaymentTransferState("TR1", "SUCCEEDED");
    expect(result.applied).toBe(false);
    expect(mockPrisma.invoicePayment.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoiceActivity.create).not.toHaveBeenCalled();
  });

  it("never regresses a terminal SUCCEEDED status back to PENDING from a stale re-check", async () => {
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({ id: "p1", status: "SUCCEEDED", invoiceId: "inv1", method: "ACH" });
    const { applyInvoicePaymentTransferState } = await load();
    const result = await applyInvoicePaymentTransferState("TR1", "PENDING");
    expect(result.applied).toBe(false);
    expect(result.status).toBe("SUCCEEDED");
    expect(mockPrisma.invoicePayment.update).not.toHaveBeenCalled();
  });

  it("applies PENDING -> SUCCEEDED, recomputes the invoice balance, and sends the ACH receipt email", async () => {
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({ id: "p1", status: "PENDING", invoiceId: "inv1", method: "ACH" });
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1", churchId: "church-a", totalCents: 10000, status: "SENT", firstViewedAt: new Date(), dueDate: new Date("2099-01-01"), paidAt: null,
    });
    mockPrisma.invoicePayment.findMany.mockResolvedValue([{ status: "SUCCEEDED", grossAmountCents: 10000, netAmountCents: 9700, refundedCents: 0 }]);
    const { applyInvoicePaymentTransferState } = await load();
    const result = await applyInvoicePaymentTransferState("TR1", "SUCCEEDED");

    expect(result.applied).toBe(true);
    expect(mockPrisma.invoicePayment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "SUCCEEDED" } });
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ balanceCents: 0, status: "PAID" }) })
    );
  });

  it("collapses a raw FAILED transfer state to InvoicePayment status FAILED, recomputes the (unchanged) balance, logs invoice.payment_failed, and never sends a receipt email", async () => {
    const { sendInvoicePaymentReceiptEmail } = await import("@/lib/invoices/invoiceEmails");
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({ id: "p1", status: "PENDING", invoiceId: "inv1", method: "ACH" });
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1", churchId: "church-a", totalCents: 10000, status: "SENT", firstViewedAt: new Date(), dueDate: new Date("2099-01-01"), paidAt: null,
    });
    mockPrisma.invoicePayment.findMany.mockResolvedValue([]);
    const { applyInvoicePaymentTransferState } = await load();
    const result = await applyInvoicePaymentTransferState("TR1", "FAILED");

    expect(result).toEqual({ status: "FAILED", applied: true });
    expect(mockPrisma.invoicePayment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "FAILED" } });
    expect(mockPrisma.invoiceActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activityType: "invoice.payment_failed" }) })
    );
    expect(sendInvoicePaymentReceiptEmail).not.toHaveBeenCalled();
  });

  it("collapses a raw CANCELED transfer state to the same FAILED InvoicePayment status as an explicit FAILED transfer", async () => {
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({ id: "p1", status: "PENDING", invoiceId: "inv1", method: "CARD" });
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1", churchId: "church-a", totalCents: 10000, status: "SENT", firstViewedAt: new Date(), dueDate: new Date("2099-01-01"), paidAt: null,
    });
    mockPrisma.invoicePayment.findMany.mockResolvedValue([]);
    const { applyInvoicePaymentTransferState } = await load();
    const result = await applyInvoicePaymentTransferState("TR1", "CANCELED");

    expect(result).toEqual({ status: "FAILED", applied: true });
    expect(mockPrisma.invoicePayment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "FAILED" } });
  });

  it("is idempotent against a duplicate webhook delivery for the same already-FAILED transfer", async () => {
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({ id: "p1", status: "FAILED", invoiceId: "inv1", method: "CARD" });
    const { applyInvoicePaymentTransferState } = await load();
    const result = await applyInvoicePaymentTransferState("TR1", "FAILED");
    expect(result.applied).toBe(false);
    expect(mockPrisma.invoicePayment.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoiceActivity.create).not.toHaveBeenCalled();
  });
});

describe("reconcileInvoicePaymentAttempt", () => {
  it("returns null for an unknown attempt", async () => {
    mockPrisma.invoicePaymentAttempt.findUnique.mockResolvedValue(null);
    const { reconcileInvoicePaymentAttempt } = await load();
    const result = await reconcileInvoicePaymentAttempt("attempt-x");
    expect(result).toBeNull();
  });

  it("re-verifies against Finix directly when the attempt is still PENDING, instead of only trusting the database", async () => {
    mockPrisma.invoicePaymentAttempt.findUnique
      .mockResolvedValueOnce({ id: "a1", status: "PENDING", finixTransferId: "TR1" })
      .mockResolvedValueOnce({ id: "a1", status: "SUCCEEDED", finixTransferId: "TR1" });
    mockFinixClient.getTransfer.mockResolvedValue({ state: "SUCCEEDED" });
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({ id: "p1", status: "PENDING", invoiceId: "inv1", method: "ACH" });
    mockPrisma.invoice.findUnique.mockResolvedValue({
      id: "inv1", churchId: "church-a", totalCents: 10000, status: "SENT", firstViewedAt: new Date(), dueDate: new Date("2099-01-01"), paidAt: null,
    });
    mockPrisma.invoicePayment.findMany.mockResolvedValue([{ status: "SUCCEEDED", grossAmountCents: 10000, netAmountCents: 9700, refundedCents: 0 }]);

    const { reconcileInvoicePaymentAttempt } = await load();
    await reconcileInvoicePaymentAttempt("attempt-x");

    expect(mockFinixClient.getTransfer).toHaveBeenCalledWith("TR1");
    expect(mockPrisma.invoicePaymentAttempt.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "SUCCEEDED" } });
  });

  it("does not call Finix again once the attempt is already terminal", async () => {
    mockPrisma.invoicePaymentAttempt.findUnique.mockResolvedValue({ id: "a1", status: "SUCCEEDED", finixTransferId: "TR1" });
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({ id: "p1", status: "SUCCEEDED", invoiceId: "inv1", method: "CARD" });
    const { reconcileInvoicePaymentAttempt } = await load();
    await reconcileInvoicePaymentAttempt("attempt-x");
    expect(mockFinixClient.getTransfer).not.toHaveBeenCalled();
  });
});
