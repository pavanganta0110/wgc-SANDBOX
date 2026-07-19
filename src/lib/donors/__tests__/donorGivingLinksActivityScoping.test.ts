import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finixTransfer: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    finixSubscription: { findMany: vi.fn() },
    givingLink: { findMany: vi.fn() },
    finixRefundOrReversal: { findMany: vi.fn() },
    bankReturn: { findMany: vi.fn() },
    finixDispute: { findMany: vi.fn() },
    donorNote: { findMany: vi.fn() },
  },
}));

describe("CP4C: loadDonorGivingLinksTab — a fundraiser cannot see another fundraiser's giving links for a shared donor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("user-scoped view keeps only links owned by the scoped fundraiser with activity attributed to them", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorGivingLinksTab } = await import("@/lib/donors/donorTabs");

    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([
      { finixTransferId: "t-a", amountCents: 1000, createdAtFinix: new Date() },
      { finixTransferId: "t-b", amountCents: 2000, createdAtFinix: new Date() },
    ] as never);
    // Only fundraiser-a's payment matches the attributedUserId filter.
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      { finixTransferId: "t-a", givingLinkId: "link-a", status: "SUCCEEDED", createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.givingLink.findMany).mockImplementation((async ({ where }: any) => {
      if (where.ownerUserId === "fundraiser-a" && where.id.in.includes("link-a")) {
        return [{ id: "link-a", publicTitle: "Fundraiser A's Link" }];
      }
      return [];
    }) as any);

    const rows = await loadDonorGivingLinksTab(["i1"], "church-a", "fundraiser-a");

    expect(rows).toHaveLength(1);
    expect(rows[0].link.id).toBe("link-a");

    const paymentWhere = (vi.mocked(prisma.payment.findMany).mock.calls[0][0] as any).where;
    expect(paymentWhere.attributedUserId).toBe("fundraiser-a");
    const linkWhere = (vi.mocked(prisma.givingLink.findMany).mock.calls[0][0] as any).where;
    expect(linkWhere.ownerUserId).toBe("fundraiser-a");
  });

  it("organization scope sees giving links owned by all fundraisers for the same donor", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorGivingLinksTab } = await import("@/lib/donors/donorTabs");

    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([
      { finixTransferId: "t-a", amountCents: 1000, createdAtFinix: new Date() },
      { finixTransferId: "t-b", amountCents: 2000, createdAtFinix: new Date() },
    ] as never);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      { finixTransferId: "t-a", givingLinkId: "link-a", status: "SUCCEEDED", createdAt: new Date() },
      { finixTransferId: "t-b", givingLinkId: "link-b", status: "SUCCEEDED", createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.givingLink.findMany).mockResolvedValue([
      { id: "link-a", publicTitle: "A" },
      { id: "link-b", publicTitle: "B" },
    ] as never);

    const rows = await loadDonorGivingLinksTab(["i1"], "church-a", undefined);

    expect(rows).toHaveLength(2);
    const linkWhere = (vi.mocked(prisma.givingLink.findMany).mock.calls[0][0] as any).where;
    expect(linkWhere.ownerUserId).toBeUndefined();
  });
});

describe("CP4C: loadDonorActivityTab — no mixed-history leakage for a donor shared across multiple fundraisers", () => {
  beforeEach(() => vi.clearAllMocks());

  const donor = { id: "donor-1", createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01") };

  it("user-scoped view only includes transfers/refunds/disputes/returns bridged through the scoped user's attributed payments", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorActivityTab } = await import("@/lib/donors/donorTabs");

    // resolveScopedTransferIds internals: all transfers on the instrument, then bridge via Payment.
    vi.mocked(prisma.finixTransfer.findMany).mockImplementation((async ({ where }: any) => {
      if (where.finixTransferId?.in) {
        return [{ finixTransferId: "t-a", createdAtFinix: new Date(), state: "SUCCEEDED", amountCents: 500 }];
      }
      return [{ finixTransferId: "t-a" }, { finixTransferId: "t-b" }];
    }) as any);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ finixTransferId: "t-a" }] as never); // only t-a is fundraiser-a's
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.donorNote.findMany).mockResolvedValue([{ id: "note-1", createdAt: new Date(), createdByEmail: "staff@x.com" }] as never);
    vi.mocked(prisma.finixRefundOrReversal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.bankReturn.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixDispute.findMany).mockResolvedValue([] as never);

    const events = await loadDonorActivityTab(donor, ["i1"], "church-a", "fundraiser-a");

    expect(events.some((e) => e.label === "Donation Succeeded")).toBe(true);
    // Notes are organization-internal — never surfaced in user scope.
    expect(events.some((e) => e.label === "Note Added")).toBe(false);
    expect(prisma.donorNote.findMany).not.toHaveBeenCalled();
  });

  it("organization scope includes complete donor activity, including notes and all fundraisers' transactions", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorActivityTab } = await import("@/lib/donors/donorTabs");

    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([
      { finixTransferId: "t-a", createdAtFinix: new Date(), state: "SUCCEEDED", amountCents: 500 },
      { finixTransferId: "t-b", createdAtFinix: new Date(), state: "SUCCEEDED", amountCents: 700 },
    ] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.donorNote.findMany).mockResolvedValue([{ id: "note-1", createdAt: new Date(), createdByEmail: "staff@x.com" }] as never);
    vi.mocked(prisma.finixRefundOrReversal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.bankReturn.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixDispute.findMany).mockResolvedValue([] as never);

    const events = await loadDonorActivityTab(donor, ["i1"], "church-a", undefined);

    expect(events.filter((e) => e.label === "Donation Succeeded")).toHaveLength(2);
    expect(events.some((e) => e.label === "Note Added")).toBe(true);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it("a fundraiser with zero attributed transfers for this donor sees no transaction events", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { loadDonorActivityTab } = await import("@/lib/donors/donorTabs");

    vi.mocked(prisma.finixTransfer.findMany).mockResolvedValue([{ finixTransferId: "t-b" }] as never);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);

    const events = await loadDonorActivityTab(donor, ["i1"], "church-a", "fundraiser-with-nothing");

    expect(events.some((e) => e.label.startsWith("Donation"))).toBe(false);
    expect(prisma.finixRefundOrReversal.findMany).not.toHaveBeenCalled();
  });
});
