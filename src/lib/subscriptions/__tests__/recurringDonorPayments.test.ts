import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findMany: vi.fn() },
    finixTransfer: { count: vi.fn(), findMany: vi.fn() },
    finixRefundOrReversal: { findMany: vi.fn() },
    bankReturn: { findMany: vi.fn() },
    finixDispute: { findMany: vi.fn() },
  },
}));

describe("CP4C: loadRecurringPaymentsForDonor — attributed-user scoping for recurring-donor payment history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fundraiser A sees only A's attributed recurring payments", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadRecurringPaymentsForDonor } = await import("@/lib/subscriptions/recurringDonorPayments");

    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ finixTransferId: "t-a" }] as never);
    vi.mocked(prisma.finixTransfer.count).mockImplementation((async ({ where }: any) => {
      return where.finixTransferId?.in?.includes("t-a") && !where.finixTransferId.in.includes("t-b") ? 1 : 0;
    }) as any);
    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([{ finixTransferId: "t-a" }] as never);
    vi.mocked(prisma.finixRefundOrReversal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.bankReturn.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixDispute.findMany).mockResolvedValue([] as never);

    const { rows, totalCount } = await loadRecurringPaymentsForDonor(["i1"], "church-a", 1, 25, "fundraiser-a");

    expect(totalCount).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].transfer.finixTransferId).toBe("t-a");

    const countWhere = (vi.mocked(prisma.finixTransfer.count).mock.calls[0][0] as any).where;
    expect(countWhere.finixTransferId).toEqual({ in: ["t-a"] });
  });

  it("fundraiser B sees only B's attributed recurring payments for the same donor", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadRecurringPaymentsForDonor } = await import("@/lib/subscriptions/recurringDonorPayments");

    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ finixTransferId: "t-b" }] as never);
    vi.mocked(prisma.finixTransfer.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([{ finixTransferId: "t-b" }] as never);
    vi.mocked(prisma.finixRefundOrReversal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.bankReturn.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixDispute.findMany).mockResolvedValue([] as never);

    const { rows } = await loadRecurringPaymentsForDonor(["i1"], "church-a", 1, 25, "fundraiser-b");

    expect(rows).toHaveLength(1);
    expect(rows[0].transfer.finixTransferId).toBe("t-b");
    expect(rows.some((r) => r.transfer.finixTransferId === "t-a")).toBe(false);
  });

  it("owner/organization scope (no attributedUserId) sees the complete same-church history", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadRecurringPaymentsForDonor } = await import("@/lib/subscriptions/recurringDonorPayments");

    vi.mocked(prisma.finixTransfer.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([{ finixTransferId: "t-a" }, { finixTransferId: "t-b" }] as never);
    vi.mocked(prisma.finixRefundOrReversal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.bankReturn.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixDispute.findMany).mockResolvedValue([] as never);

    const { rows, totalCount } = await loadRecurringPaymentsForDonor(["i1"], "church-a", 1, 25, undefined);

    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it("excludes an unattributed payment from user scope — a fundraiser with zero attributed transfers gets an empty result, not the full org set", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadRecurringPaymentsForDonor } = await import("@/lib/subscriptions/recurringDonorPayments");

    vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never);

    const { rows, totalCount } = await loadRecurringPaymentsForDonor(["i1"], "church-a", 1, 25, "fundraiser-with-nothing");

    expect(totalCount).toBe(0);
    expect(rows).toEqual([]);
    expect(prisma.finixTransfer.count).not.toHaveBeenCalled();
    expect(prisma.finixTransfer.findMany).not.toHaveBeenCalled();
  });
});
