import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finixTransfer: { findMany: vi.fn() },
    finixRefundOrReversal: { findMany: vi.fn() },
    bankReturn: { findMany: vi.fn() },
    finixDispute: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    finixSubscription: { findMany: vi.fn() },
  },
}));

describe("CP4B: donor detail history scoping — a fundraiser cannot see another fundraiser's donations for the same shared donor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loadDonorDonationsTab keeps only rows whose Payment.attributedUserId matches the scoped fundraiser", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorDonationsTab } = await import("@/lib/donors/donorTabs");

    // Same donor, two donations through two different fundraisers' links.
    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([
      { finixTransferId: "t-fundraiser-a", finixPaymentInstrumentId: "i1", amountCents: 5000, state: "SUCCEEDED", createdAtFinix: new Date() },
      { finixTransferId: "t-fundraiser-b", finixPaymentInstrumentId: "i1", amountCents: 7500, state: "SUCCEEDED", createdAtFinix: new Date() },
    ] as never);
    vi.mocked(prisma.finixRefundOrReversal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.bankReturn.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixDispute.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      { finixTransferId: "t-fundraiser-a", attributedUserId: "fundraiser-a" },
      { finixTransferId: "t-fundraiser-b", attributedUserId: "fundraiser-b" },
    ] as never);

    const { rows, totalCount } = await loadDonorDonationsTab(["i1"], "church-a", {}, 1, 25, "fundraiser-a");

    expect(totalCount).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].transfer.finixTransferId).toBe("t-fundraiser-a");
    expect(rows.some((r) => r.transfer.finixTransferId === "t-fundraiser-b")).toBe(false);
  });

  it("organization scope (no attributedUserId) sees both fundraisers' donations", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorDonationsTab } = await import("@/lib/donors/donorTabs");

    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([
      { finixTransferId: "t-fundraiser-a", finixPaymentInstrumentId: "i1", amountCents: 5000, state: "SUCCEEDED", createdAtFinix: new Date() },
      { finixTransferId: "t-fundraiser-b", finixPaymentInstrumentId: "i1", amountCents: 7500, state: "SUCCEEDED", createdAtFinix: new Date() },
    ] as never);
    vi.mocked(prisma.finixRefundOrReversal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.bankReturn.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixDispute.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      { finixTransferId: "t-fundraiser-a", attributedUserId: "fundraiser-a" },
      { finixTransferId: "t-fundraiser-b", attributedUserId: "fundraiser-b" },
    ] as never);

    const { totalCount } = await loadDonorDonationsTab(["i1"], "church-a", {}, 1, 25, undefined);
    expect(totalCount).toBe(2);
  });

  it("loadDonorRecurringTab filters FinixSubscription by attributedUserId directly", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorRecurringTab } = await import("@/lib/donors/donorTabs");
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([{ id: "sub-1" }] as never);

    await loadDonorRecurringTab(["i1"], "church-a", "fundraiser-a");

    expect(prisma.finixSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ attributedUserId: "fundraiser-a" }) })
    );
  });

  it("loadDonorRefundsTab only returns refunds whose original transfer belongs to the scoped user's attributed payments", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorRefundsTab } = await import("@/lib/donors/donorTabs");

    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([
      { finixTransferId: "t-a" },
      { finixTransferId: "t-b" },
    ] as never);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ finixTransferId: "t-a" }] as never); // only t-a is fundraiser-a's
    vi.mocked(prisma.finixRefundOrReversal.findMany).mockResolvedValue([{ finixOriginalTransferId: "t-a", amountCents: 100 }] as never);

    await loadDonorRefundsTab(["i1"], "church-a", "fundraiser-a");

    const call: any = vi.mocked(prisma.finixRefundOrReversal.findMany).mock.calls[0][0];
    expect(call.where.finixOriginalTransferId.in).toEqual(["t-a"]);
    expect(call.where.finixOriginalTransferId.in).not.toContain("t-b");
  });

  it("loadDonorDisputesTab and loadDonorBankReturnsTab return nothing when the scoped user has zero attributed transfers for this donor", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorDisputesTab, loadDonorBankReturnsTab } = await import("@/lib/donors/donorTabs");

    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([{ finixTransferId: "t-b" }] as never);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never); // no payments attributed to fundraiser-a on this donor

    const disputes = await loadDonorDisputesTab(["i1"], "church-a", "fundraiser-a");
    const returns = await loadDonorBankReturnsTab(["i1"], "church-a", "fundraiser-a");

    expect(disputes).toEqual([]);
    expect(returns).toEqual([]);
    expect(prisma.finixDispute.findMany).not.toHaveBeenCalled();
    expect(prisma.bankReturn.findMany).not.toHaveBeenCalled();
  });
});
