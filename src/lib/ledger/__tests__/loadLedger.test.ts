import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  payment: { findMany: vi.fn(), findFirst: vi.fn() },
  externalDonation: { findMany: vi.fn() },
  donor: { findMany: vi.fn() },
  finixTransfer: { findMany: vi.fn() },
  finixRefundOrReversal: { findMany: vi.fn() },
  finixDispute: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function paymentRow(id: string, createdAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    donorId: "donor1",
    createdAt: new Date(createdAt),
    status: "SUCCEEDED",
    paymentMethodType: "PAYMENT_CARD",
    cardBrand: "VISA",
    amountCents: 5_000,
    donationAmountCents: 5_000,
    feeCoveredCents: 0,
    donorCoversFee: false,
    actualFinixFeesCents: null,
    merchantExpectedNetCents: 4_850,
    fundId: "fund1",
    fundName: "General",
    finixSubscriptionId: null,
    finixTransferId: `TR_${id}`,
    goodsServicesProvided: false,
    goodsServicesDescription: null,
    goodsServicesFairMarketValueCents: null,
    givingLinkId: null,
    receiptNumber: null,
    ...overrides,
  };
}

const donor = { id: "donor1", name: "Maya Torres", email: "m@example.com", phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, country: null };

describe("loadLedgerRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.externalDonation.findMany.mockResolvedValue([]);
    mockPrisma.donor.findMany.mockResolvedValue([donor]);
    mockPrisma.finixTransfer.findMany.mockResolvedValue([]);
    mockPrisma.finixRefundOrReversal.findMany.mockResolvedValue([]);
    mockPrisma.finixDispute.findMany.mockResolvedValue([]);
  });

  it("scopes every query to the church and the window", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([paymentRow("p1", "2026-02-01T00:00:00Z")]);
    const { loadLedgerRows } = await import("../loadLedger");
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2027-01-01T00:00:00Z");

    await loadLedgerRows({ churchId: "church-a", from, to });

    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a", createdAt: { gte: from, lt: to } }) })
    );
    expect(mockPrisma.externalDonation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a" }) }));
    expect(mockPrisma.donor.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a" }) }));
    expect(mockPrisma.finixRefundOrReversal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a" }) }));
    expect(mockPrisma.finixDispute.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a" }) }));
  });

  it("loads donors, refunds, disputes and transfers once for the whole window, never per gift", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([paymentRow("p1", "2026-02-01T00:00:00Z"), paymentRow("p2", "2026-02-02T00:00:00Z"), paymentRow("p3", "2026-02-03T00:00:00Z")]);
    const { loadLedgerRows } = await import("../loadLedger");

    const { rows } = await loadLedgerRows({ churchId: "church-a", from: new Date("2026-01-01"), to: new Date("2026-03-01") });

    expect(rows).toHaveLength(3);
    expect(mockPrisma.donor.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.finixRefundOrReversal.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.finixDispute.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.finixTransfer.findMany).toHaveBeenCalledTimes(1);
  });

  it("sums successful refunds per gift and ignores failed ones", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([paymentRow("p1", "2026-02-01T00:00:00Z")]);
    mockPrisma.finixRefundOrReversal.findMany.mockResolvedValue([
      { originalPaymentId: "p1", amountCents: 1_000, state: "SUCCEEDED" },
      { originalPaymentId: "p1", amountCents: 500, state: "PENDING" },
      { originalPaymentId: "p1", amountCents: 9_999, state: "FAILED" },
    ]);
    const { loadLedgerRows } = await import("../loadLedger");

    const { rows } = await loadLedgerRows({ churchId: "church-a", from: new Date("2026-01-01"), to: new Date("2026-03-01") });

    expect(rows[0].refundedCents).toBe(1_500);
    expect(rows[0].refunded).toBe(true);
  });

  it("merges external gifts with WGC gifts in date order", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([paymentRow("p1", "2026-02-10T00:00:00Z")]);
    mockPrisma.externalDonation.findMany.mockResolvedValue([
      {
        id: "e1", donorId: "donor1", donationDate: new Date("2026-02-05T00:00:00Z"), paymentMethod: "CASH", status: "RECORDED", donationAmountCents: 2_000,
        supplementalFeeCents: 0, processingFeeCents: 0, providerFeeCents: null, netAmountReceivedCents: 2_000, fundId: null, fundName: null,
        goodsOrServicesProvided: false, goodsOrServicesDescription: null, goodsOrServicesValueCents: null, finixSettlementId: null, voidedAt: null, receiptNumber: null,
      },
    ]);
    const { loadLedgerRows } = await import("../loadLedger");

    const { rows } = await loadLedgerRows({ churchId: "church-a", from: new Date("2026-01-01"), to: new Date("2026-03-01") });

    expect(rows.map((r) => r.id)).toEqual(["e1", "p1"]);
    expect(rows[0]).toMatchObject({ source: "EXTERNAL", method: "external" });
  });

  it("reports truncation when the window holds more than the row cap", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([paymentRow("p1", "2026-02-01T00:00:00Z"), paymentRow("p2", "2026-02-02T00:00:00Z"), paymentRow("p3", "2026-02-03T00:00:00Z")]);
    const { loadLedgerRows } = await import("../loadLedger");

    const result = await loadLedgerRows({ churchId: "church-a", from: new Date("2026-01-01"), to: new Date("2026-03-01"), maxRows: 2 });

    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(2);
  });
});

describe("withLedgerRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.donor.findMany.mockResolvedValue([donor]);
    mockPrisma.finixTransfer.findMany.mockResolvedValue([]);
    mockPrisma.finixRefundOrReversal.findMany.mockResolvedValue([]);
    mockPrisma.finixDispute.findMany.mockResolvedValue([]);
  });

  it("adds the ledger row under `ledger` and keeps the base payload", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(paymentRow("p1", "2026-02-01T00:00:00Z"));
    const { withLedgerRow } = await import("../loadLedger");

    const data = await withLedgerRow("church-a", "p1", { paymentId: "p1", donorId: "donor1" });

    expect(data).toMatchObject({ paymentId: "p1", donorId: "donor1", ledger: { id: "p1", designation: { fundId: "fund1" } } });
    expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", churchId: "church-a" } }));
  });

  it("returns the base payload untouched when the payment isn't this church's", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    const { withLedgerRow } = await import("../loadLedger");

    expect(await withLedgerRow("church-a", "p1", { paymentId: "p1" })).toEqual({ paymentId: "p1" });
  });

  it("never throws: a failed lookup still returns the base payload", async () => {
    mockPrisma.payment.findFirst.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { withLedgerRow } = await import("../loadLedger");

    expect(await withLedgerRow("church-a", "p1", { paymentId: "p1" })).toEqual({ paymentId: "p1" });
    spy.mockRestore();
  });
});
