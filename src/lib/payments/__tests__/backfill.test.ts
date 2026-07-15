import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetTransfer = vi.fn();
vi.mock("@/lib/finix/client", () => ({
  finixClient: {
    getTransfer: mockGetTransfer,
  },
}));

describe("reconcilePaymentFees backfill", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("backfills payment record when donor covers the fee", async () => {
    const mockPayment = {
      id: "P1",
      finixTransferId: "TR1",
      donationAmountCents: 5000,
      amountCents: 5145,
      feeCoveredCents: null,
      donorCoversFee: null,
      feeCalculationVersion: null,
    };

    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      payment: {
        findUnique: vi.fn().mockResolvedValue(mockPayment),
        update: updateMock,
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    mockGetTransfer.mockResolvedValue({
      id: "TR1",
      amount: 5145,
      supplemental_fee: 145,
      card: { brand: "VISA" },
    });

    const { reconcilePaymentFees } = await import("@/lib/payments/backfill");
    await reconcilePaymentFees("P1");

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "P1" },
      data: {
        donorCoversFee: true,
        cardBrand: "VISA",
        percentageBps: 300,
        fixedFeeCents: 0,
        feeCalculationVersion: "historical_backfilled",
        merchantExpectedNetCents: 5000,
        feeCoveredCents: 145,
      },
    });
  });

  it("backfills payment record when donor does not cover the fee", async () => {
    const mockPayment = {
      id: "P2",
      finixTransferId: "TR2",
      donationAmountCents: 5000,
      amountCents: 5000,
      feeCoveredCents: null,
      donorCoversFee: null,
      feeCalculationVersion: null,
    };

    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      payment: {
        findUnique: vi.fn().mockResolvedValue(mockPayment),
        update: updateMock,
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    mockGetTransfer.mockResolvedValue({
      id: "TR2",
      amount: 5000,
      supplemental_fee: 145,
      card: { brand: "VISA" },
    });

    const { reconcilePaymentFees } = await import("@/lib/payments/backfill");
    await reconcilePaymentFees("P2");

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "P2" },
      data: {
        donorCoversFee: false,
        cardBrand: "VISA",
        percentageBps: 230,
        fixedFeeCents: 25,
        feeCalculationVersion: "historical_backfilled",
        merchantExpectedNetCents: 4855,
        feeCoveredCents: 145,
      },
    });
  });

  it("reconciles even when totalCharged equals donation amount but supplemental_fee is non-zero", async () => {
    const mockPayment = {
      id: "P3",
      finixTransferId: "TR3",
      donationAmountCents: 5000,
      amountCents: 5000,
      feeCoveredCents: null,
      donorCoversFee: null,
      feeCalculationVersion: null,
    };

    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      payment: {
        findUnique: vi.fn().mockResolvedValue(mockPayment),
        update: updateMock,
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    mockGetTransfer.mockResolvedValue({
      id: "TR3",
      amount: 5000,
      supplemental_fee: 145,
      card: { brand: "VISA" },
    });

    const { reconcilePaymentFees } = await import("@/lib/payments/backfill");
    await reconcilePaymentFees("P3");

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "P3" },
      data: {
        donorCoversFee: false,
        cardBrand: "VISA",
        percentageBps: 230,
        fixedFeeCents: 25,
        feeCalculationVersion: "historical_backfilled",
        merchantExpectedNetCents: 4855,
        feeCoveredCents: 145,
      },
    });
  });

  it("skips reconciliation if calculation version is already present", async () => {
    const mockPayment = {
      id: "P4",
      finixTransferId: "TR4",
      donationAmountCents: 5000,
      amountCents: 5145,
      feeCoveredCents: 145,
      donorCoversFee: true,
      feeCalculationVersion: "v1",
    };

    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      payment: {
        findUnique: vi.fn().mockResolvedValue(mockPayment),
        update: updateMock,
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

    const { reconcilePaymentFees } = await import("@/lib/payments/backfill");
    const result = await reconcilePaymentFees("P4");

    expect(result).toEqual(mockPayment);
    expect(mockGetTransfer).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
