import { describe, it, expect, vi, beforeEach } from "vitest";

// syncPaymentInstrument/syncFeesForTransfer do their own Finix round-trips —
// irrelevant to invoice usage-ledger recording and mocked out so the TRANSFER
// branch under test doesn't need to simulate their prisma models too.
vi.mock("@/lib/finix/sync/syncPaymentInstruments", () => ({ syncPaymentInstrument: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/finix/sync/syncFees", () => ({ syncFeesForTransfer: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/settings/notificationDispatch", () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }));

const recordInvoiceUsageEvent = vi.fn().mockResolvedValue({ recorded: true, billable: false });
vi.mock("@/lib/billing/invoiceUsageLedger", () => ({ recordInvoiceUsageEvent }));

const mockPrisma = {
  church: { findFirst: vi.fn().mockResolvedValue({ id: "church-a" }) },
  finixTransfer: {
    upsert: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue(null),
  },
  payment: {
    findFirst: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({}),
  },
  finixRefundOrReversal: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  },
  givingLink: { updateMany: vi.fn().mockResolvedValue({}) },
  invoicePayment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({}),
  },
  invoice: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  invoiceActivity: { create: vi.fn().mockResolvedValue({}) },
  bankReturn: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  finixPaymentInstrumentSnapshot: { findUnique: vi.fn().mockResolvedValue(null) },
  finixDispute: {
    findUnique: vi.fn().mockResolvedValue({ id: "existing-dispute" }),
    upsert: vi.fn().mockResolvedValue({}),
  },
  finixFee: { findMany: vi.fn().mockResolvedValue([]) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.church.findFirst.mockResolvedValue({ id: "church-a" });
  mockPrisma.finixTransfer.upsert.mockResolvedValue({});
  mockPrisma.finixTransfer.findUnique.mockResolvedValue(null);
  mockPrisma.payment.findFirst.mockResolvedValue(null);
  mockPrisma.finixDispute.findUnique.mockResolvedValue({ id: "existing-dispute" });
  recordInvoiceUsageEvent.mockResolvedValue({ recorded: true, billable: false });
});

const invoiceRecord = {
  id: "inv-1",
  churchId: "church-a",
  totalCents: 10000,
  status: "PAID",
  firstViewedAt: new Date(),
  dueDate: new Date("2099-01-01"),
};

describe("online refund (REVERSAL transfer) records invoice usage", () => {
  it("records INVOICE_REFUNDED with the ${transferId}:REFUND:${newRefundedCents} idempotency key on a full refund", async () => {
    mockPrisma.finixRefundOrReversal.findUnique.mockResolvedValue({ state: "PENDING" });
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({
      id: "ip-1",
      invoiceId: "inv-1",
      grossAmountCents: 10000,
      refundedCents: 0,
    });
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceRecord);
    mockPrisma.invoicePayment.findMany.mockResolvedValue([]);

    const { syncFinixDataFromWebhookEvent } = await load();
    await syncFinixDataFromWebhookEvent(
      "TRANSFER",
      "transfer.updated",
      {
        id: "reversal-1",
        subtype: "REVERSAL",
        state: "SUCCEEDED",
        amount: 10000,
        parent_transfer: "original-transfer-1",
        merchant: "merchant-1",
      },
      "evt-1",
      new Date()
    );

    expect(recordInvoiceUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "church-a",
        invoiceId: "inv-1",
        invoicePaymentId: "ip-1",
        eventType: "INVOICE_REFUNDED",
        idempotencyKey: "original-transfer-1:REFUND:10000",
      })
    );
  });

  it("is a no-op on a retried/duplicate delivery (idempotency is delegated to recordInvoiceUsageEvent)", async () => {
    recordInvoiceUsageEvent.mockResolvedValue({ recorded: false, billable: false });
    mockPrisma.finixRefundOrReversal.findUnique.mockResolvedValue({ state: "PENDING" });
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({
      id: "ip-1",
      invoiceId: "inv-1",
      grossAmountCents: 10000,
      refundedCents: 0,
    });
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceRecord);
    mockPrisma.invoicePayment.findMany.mockResolvedValue([]);

    const { syncFinixDataFromWebhookEvent } = await load();
    const payload = {
      id: "reversal-1",
      subtype: "REVERSAL",
      state: "SUCCEEDED",
      amount: 10000,
      parent_transfer: "original-transfer-1",
      merchant: "merchant-1",
    };
    await syncFinixDataFromWebhookEvent("TRANSFER", "transfer.updated", payload, "evt-1", new Date());
    await syncFinixDataFromWebhookEvent("TRANSFER", "transfer.updated", payload, "evt-1", new Date());

    expect(recordInvoiceUsageEvent).toHaveBeenCalledTimes(2);
    // recordInvoiceUsageEvent itself is idempotent (tested in
    // invoiceUsageLedger.test.ts) — the webhook path just calls it again on
    // retry with the same key and never throws when told "already recorded".
    expect(recordInvoiceUsageEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ idempotencyKey: "original-transfer-1:REFUND:10000" })
    );
  });
});

describe("ACH return records INVOICE_PAYMENT_REVERSED", () => {
  it("records INVOICE_PAYMENT_REVERSED for a returned invoice payment", async () => {
    mockPrisma.bankReturn.findUnique.mockResolvedValue({ state: "PENDING" });
    mockPrisma.finixTransfer.findUnique.mockResolvedValue({ tagsJson: null });
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({
      id: "ip-2",
      invoiceId: "inv-1",
      grossAmountCents: 5000,
      refundedCents: 0,
    });
    mockPrisma.invoice.findUnique.mockResolvedValue({ ...invoiceRecord, totalCents: 5000 });
    mockPrisma.invoicePayment.findMany.mockResolvedValue([]);

    const { syncFinixDataFromWebhookEvent } = await load();
    await syncFinixDataFromWebhookEvent(
      "TRANSFER",
      "transfer.updated",
      {
        id: "return-1",
        subtype: "ACH_RETURN",
        state: "SUCCEEDED",
        amount: 5000,
        parent_transfer: "original-transfer-2",
        merchant: "merchant-1",
      },
      "evt-2",
      new Date()
    );

    expect(recordInvoiceUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "church-a",
        invoiceId: "inv-1",
        invoicePaymentId: "ip-2",
        eventType: "INVOICE_PAYMENT_REVERSED",
        idempotencyKey: "original-transfer-2:ACH_RETURN:5000",
      })
    );
  });
});

describe("dispute lifecycle records invoice usage only on a terminal loss", () => {
  it("records INVOICE_PAYMENT_REVERSED when a dispute resolves LOST", async () => {
    mockPrisma.invoicePayment.updateMany.mockResolvedValue({});
    mockPrisma.invoicePayment.findMany.mockResolvedValue([{ id: "ip-3", invoiceId: "inv-1" }]);
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceRecord);

    const { syncFinixDataFromWebhookEvent } = await load();
    await syncFinixDataFromWebhookEvent(
      "DISPUTE",
      "dispute.updated",
      {
        id: "dispute-1",
        merchant: "merchant-1",
        transfer: "original-transfer-3",
        state: "LOST",
        amount: 2500,
      },
      "evt-3",
      new Date()
    );

    expect(recordInvoiceUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "church-a",
        invoiceId: "inv-1",
        invoicePaymentId: "ip-3",
        eventType: "INVOICE_PAYMENT_REVERSED",
        idempotencyKey: "dispute-1:DISPUTE_LOST:ip-3",
      })
    );
  });

  it("does not record a usage event when a dispute is merely opened/pending", async () => {
    mockPrisma.invoicePayment.updateMany.mockResolvedValue({});

    const { syncFinixDataFromWebhookEvent } = await load();
    await syncFinixDataFromWebhookEvent(
      "DISPUTE",
      "dispute.created",
      {
        id: "dispute-2",
        merchant: "merchant-1",
        transfer: "original-transfer-4",
        state: "PENDING",
        amount: 2500,
      },
      "evt-4",
      new Date()
    );

    expect(recordInvoiceUsageEvent).not.toHaveBeenCalled();
    expect(mockPrisma.invoicePayment.findMany).not.toHaveBeenCalled();
  });

  it("does not record a usage event when a dispute is won", async () => {
    mockPrisma.invoicePayment.updateMany.mockResolvedValue({});

    const { syncFinixDataFromWebhookEvent } = await load();
    await syncFinixDataFromWebhookEvent(
      "DISPUTE",
      "dispute.updated",
      {
        id: "dispute-3",
        merchant: "merchant-1",
        transfer: "original-transfer-5",
        state: "WON",
        amount: 2500,
      },
      "evt-5",
      new Date()
    );

    expect(recordInvoiceUsageEvent).not.toHaveBeenCalled();
  });
});

describe("usage-ledger recording never blocks primary webhook processing", () => {
  it("swallows a throw from recordInvoiceUsageEvent on the refund path and still updates the invoice payment", async () => {
    recordInvoiceUsageEvent.mockRejectedValue(new Error("ledger unavailable"));
    mockPrisma.finixRefundOrReversal.findUnique.mockResolvedValue({ state: "PENDING" });
    mockPrisma.invoicePayment.findFirst.mockResolvedValue({
      id: "ip-4",
      invoiceId: "inv-1",
      grossAmountCents: 10000,
      refundedCents: 0,
    });
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceRecord);
    mockPrisma.invoicePayment.findMany.mockResolvedValue([]);

    const { syncFinixDataFromWebhookEvent } = await load();
    await expect(
      syncFinixDataFromWebhookEvent(
        "TRANSFER",
        "transfer.updated",
        {
          id: "reversal-2",
          subtype: "REVERSAL",
          state: "SUCCEEDED",
          amount: 10000,
          parent_transfer: "original-transfer-6",
          merchant: "merchant-1",
        },
        "evt-6",
        new Date()
      )
    ).resolves.toBeUndefined();

    expect(mockPrisma.invoicePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ip-4" } })
    );
  });

  it("swallows a throw from recordInvoiceUsageEvent on the dispute-lost path without breaking dispute processing", async () => {
    recordInvoiceUsageEvent.mockRejectedValue(new Error("ledger unavailable"));
    mockPrisma.invoicePayment.updateMany.mockResolvedValue({});
    mockPrisma.invoicePayment.findMany.mockResolvedValue([{ id: "ip-5", invoiceId: "inv-1" }]);
    mockPrisma.invoice.findUnique.mockResolvedValue(invoiceRecord);

    const { syncFinixDataFromWebhookEvent } = await load();
    await expect(
      syncFinixDataFromWebhookEvent(
        "DISPUTE",
        "dispute.updated",
        {
          id: "dispute-4",
          merchant: "merchant-1",
          transfer: "original-transfer-7",
          state: "LOST",
          amount: 2500,
        },
        "evt-7",
        new Date()
      )
    ).resolves.toBeUndefined();

    expect(mockPrisma.invoicePayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { finixTransferId: "original-transfer-7" } })
    );
  });
});
