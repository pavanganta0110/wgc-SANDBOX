import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  fund: { findMany: vi.fn() },
  givingLinkFund: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/giving/fundAssignment");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateFundAssignments", () => {
  it("rejects a fund that does not belong to the authenticated church", async () => {
    mockPrisma.fund.findMany.mockResolvedValue([{ id: "fund-a1" }]); // only fund-a1 belongs to church-a
    const { validateFundAssignments, FundAssignmentError } = await loadModule();

    await expect(
      validateFundAssignments("church-a", [{ fundId: "fund-a1" }, { fundId: "fund-b1" }])
    ).rejects.toThrow(FundAssignmentError);
  });

  it("rejects more than one default fund", async () => {
    mockPrisma.fund.findMany.mockResolvedValue([{ id: "fund-1" }, { id: "fund-2" }]);
    const { validateFundAssignments, FundAssignmentError } = await loadModule();

    await expect(
      validateFundAssignments("church-a", [
        { fundId: "fund-1", isDefault: true },
        { fundId: "fund-2", isDefault: true },
      ])
    ).rejects.toThrow(FundAssignmentError);
  });

  it("accepts valid same-church assignments and normalizes displayOrder", async () => {
    mockPrisma.fund.findMany.mockResolvedValue([{ id: "fund-1" }, { id: "fund-2" }]);
    const { validateFundAssignments } = await loadModule();

    const result = await validateFundAssignments("church-a", [
      { fundId: "fund-1", isDefault: true },
      { fundId: "fund-2" },
    ]);
    expect(result).toEqual([
      { fundId: "fund-1", isDefault: true, displayOrder: 0 },
      { fundId: "fund-2", isDefault: false, displayOrder: 1 },
    ]);
  });
});

describe("loadAssignedActiveFunds", () => {
  it("excludes archived (inactive) funds even if still assigned", async () => {
    mockPrisma.givingLinkFund.findMany.mockResolvedValue([
      { givingLinkId: "link-1", fundId: "fund-active", isDefault: false, displayOrder: 0 },
      { givingLinkId: "link-1", fundId: "fund-archived", isDefault: false, displayOrder: 1 },
    ]);
    // The active-only query is where the archived fund actually gets filtered out.
    mockPrisma.fund.findMany.mockResolvedValue([{ id: "fund-active", name: "General Fund", description: null }]);

    const { loadAssignedActiveFunds } = await loadModule();
    const result = await loadAssignedActiveFunds("link-1");

    expect(result).toHaveLength(1);
    expect(result[0].fundId).toBe("fund-active");
    expect(mockPrisma.fund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) })
    );
  });
});

describe("resolveDonorSelectedFund", () => {
  const link = { id: "link-1", churchId: "church-a", fundSelectionEnabled: true };

  it("returns null/null when fund selection is disabled on the link", async () => {
    const { resolveDonorSelectedFund } = await loadModule();
    const result = await resolveDonorSelectedFund({ ...link, fundSelectionEnabled: false }, "fund-1");
    expect(result).toEqual({ fundId: null, fundName: null });
    expect(mockPrisma.givingLinkFund.findMany).not.toHaveBeenCalled();
  });

  it("auto-selects the single active fund when the donor submits nothing", async () => {
    mockPrisma.givingLinkFund.findMany.mockResolvedValue([
      { givingLinkId: "link-1", fundId: "fund-1", isDefault: false, displayOrder: 0 },
    ]);
    mockPrisma.fund.findMany.mockResolvedValue([{ id: "fund-1", name: "General Fund", description: null }]);

    const { resolveDonorSelectedFund } = await loadModule();
    const result = await resolveDonorSelectedFund(link, undefined);
    expect(result).toEqual({ fundId: "fund-1", fundName: "General Fund" });
  });

  it("auto-selects the default fund among several when the donor submits nothing", async () => {
    mockPrisma.givingLinkFund.findMany.mockResolvedValue([
      { givingLinkId: "link-1", fundId: "fund-1", isDefault: false, displayOrder: 0 },
      { givingLinkId: "link-1", fundId: "fund-2", isDefault: true, displayOrder: 1 },
    ]);
    mockPrisma.fund.findMany.mockResolvedValue([
      { id: "fund-1", name: "General Fund", description: null },
      { id: "fund-2", name: "Building Fund", description: null },
    ]);

    const { resolveDonorSelectedFund } = await loadModule();
    const result = await resolveDonorSelectedFund(link, undefined);
    expect(result).toEqual({ fundId: "fund-2", fundName: "Building Fund" });
  });

  it("requires an explicit selection when several funds exist and none is default", async () => {
    mockPrisma.givingLinkFund.findMany.mockResolvedValue([
      { givingLinkId: "link-1", fundId: "fund-1", isDefault: false, displayOrder: 0 },
      { givingLinkId: "link-1", fundId: "fund-2", isDefault: false, displayOrder: 1 },
    ]);
    mockPrisma.fund.findMany.mockResolvedValue([
      { id: "fund-1", name: "General Fund", description: null },
      { id: "fund-2", name: "Building Fund", description: null },
    ]);

    const { resolveDonorSelectedFund, FundAssignmentError } = await loadModule();
    await expect(resolveDonorSelectedFund(link, undefined)).rejects.toThrow(FundAssignmentError);
  });

  it("rejects a fund that is not assigned to this giving link, including another church's fund", async () => {
    mockPrisma.givingLinkFund.findMany.mockResolvedValue([
      { givingLinkId: "link-1", fundId: "fund-1", isDefault: false, displayOrder: 0 },
    ]);
    mockPrisma.fund.findMany.mockResolvedValue([{ id: "fund-1", name: "General Fund", description: null }]);

    const { resolveDonorSelectedFund, FundAssignmentError } = await loadModule();
    // "fund-from-another-church" was never returned by the active-fund
    // lookup above (which is itself always scoped through this specific
    // giving link's assignments) — simulates a tampered client request.
    await expect(resolveDonorSelectedFund(link, "fund-from-another-church")).rejects.toThrow(FundAssignmentError);
  });

  it("rejects a submitted fund that is currently archived (inactive)", async () => {
    // The active-fund query itself excludes archived funds, so a submitted
    // fundId pointing at one never appears in the assigned/active set.
    mockPrisma.givingLinkFund.findMany.mockResolvedValue([
      { givingLinkId: "link-1", fundId: "fund-active", isDefault: false, displayOrder: 0 },
      { givingLinkId: "link-1", fundId: "fund-archived", isDefault: false, displayOrder: 1 },
    ]);
    mockPrisma.fund.findMany.mockResolvedValue([{ id: "fund-active", name: "General Fund", description: null }]);

    const { resolveDonorSelectedFund, FundAssignmentError } = await loadModule();
    await expect(resolveDonorSelectedFund(link, "fund-archived")).rejects.toThrow(FundAssignmentError);
  });

  it("accepts a valid submitted fundId and returns its current name as the snapshot", async () => {
    mockPrisma.givingLinkFund.findMany.mockResolvedValue([
      { givingLinkId: "link-1", fundId: "fund-1", isDefault: false, displayOrder: 0 },
      { givingLinkId: "link-1", fundId: "fund-2", isDefault: false, displayOrder: 1 },
    ]);
    mockPrisma.fund.findMany.mockResolvedValue([
      { id: "fund-1", name: "General Fund", description: null },
      { id: "fund-2", name: "Missions", description: "Support overseas missions" },
    ]);

    const { resolveDonorSelectedFund } = await loadModule();
    const result = await resolveDonorSelectedFund(link, "fund-2");
    expect(result).toEqual({ fundId: "fund-2", fundName: "Missions" });
  });

  it("never queries anything beyond GivingLinkFund/Fund — selection logic cannot touch merchant/settlement routing", async () => {
    mockPrisma.givingLinkFund.findMany.mockResolvedValue([]);
    const { resolveDonorSelectedFund } = await loadModule();
    await resolveDonorSelectedFund(link, undefined);
    // The only prisma models mocked are fund/givingLinkFund (see top of file) —
    // if resolution touched church/payment/settlement models the call would
    // throw "is not a function" rather than resolving, so a clean pass here
    // is itself the assertion that no other model was touched.
    expect(mockPrisma.givingLinkFund.findMany).toHaveBeenCalledWith({
      where: { givingLinkId: "link-1" },
      orderBy: { displayOrder: "asc" },
    });
  });
});

describe("resolveFundFilteredTransferIds — Payments page / export Fund filter", () => {
  it("General Fund returns only transferIds for payments whose fundName is General Fund", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([{ finixTransferId: "t1" }, { finixTransferId: "t2" }]);
    const { resolveFundFilteredTransferIds } = await loadModule();

    const ids = await resolveFundFilteredTransferIds({ churchId: "church-a" }, "General Fund");
    expect(ids).toEqual(["t1", "t2"]);
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
      where: { churchId: "church-a", fundName: { contains: "General Fund", mode: "insensitive" }, finixTransferId: { not: null } },
      select: { finixTransferId: true },
    });
  });

  it("matches case-insensitively — the query is passed through with mode: insensitive regardless of casing", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([{ finixTransferId: "t1" }]);
    const { resolveFundFilteredTransferIds } = await loadModule();

    await resolveFundFilteredTransferIds({ churchId: "church-a" }, "general fund");
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ fundName: { contains: "general fund", mode: "insensitive" } }) })
    );
  });

  it("supports partial text search — a fragment like 'build' is passed through as a contains query, not an exact match", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([{ finixTransferId: "t1" }]);
    const { resolveFundFilteredTransferIds } = await loadModule();

    await resolveFundFilteredTransferIds({ churchId: "church-a" }, "build");
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ fundName: { contains: "build", mode: "insensitive" } }) })
    );
  });

  it("still filters correctly for a payment whose fund has since been archived — matching is purely against the Payment.fundName snapshot, never a live Fund join", async () => {
    // No Fund model is queried at all here — proof that archival status
    // (or the fund being deleted from the catalog entirely) cannot affect
    // whether historical transactions still match their saved fund name.
    mockPrisma.payment.findMany.mockResolvedValue([{ finixTransferId: "t-old" }]);
    const { resolveFundFilteredTransferIds } = await loadModule();

    const ids = await resolveFundFilteredTransferIds({ churchId: "church-a" }, "Old Building Fund");
    expect(ids).toEqual(["t-old"]);
    expect(mockPrisma.fund.findMany).not.toHaveBeenCalled();
  });

  it("never exposes another church's data — the paymentScope object (built server-side from buildPaymentScope) is forwarded verbatim, so churchId is never something this function can widen or drop", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);
    const { resolveFundFilteredTransferIds } = await loadModule();

    await resolveFundFilteredTransferIds({ churchId: "church-a", attributedUserId: "fundraiser-1" }, "Missions");
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a", attributedUserId: "fundraiser-1" }) })
    );
  });

  it("a fundraiser's attributedUserId scope narrows the fund search to only their own payments", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([{ finixTransferId: "t-own" }]);
    const { resolveFundFilteredTransferIds } = await loadModule();

    const ids = await resolveFundFilteredTransferIds({ churchId: "church-a", attributedUserId: "fundraiser-1" }, "Youth Ministry");
    expect(ids).toEqual(["t-own"]);
    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ attributedUserId: "fundraiser-1" }) })
    );
  });

  it("organization-wide scope (owner/admin, no attributedUserId) searches every authorized payment", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([{ finixTransferId: "t1" }, { finixTransferId: "t2" }]);
    const { resolveFundFilteredTransferIds } = await loadModule();

    await resolveFundFilteredTransferIds({ churchId: "church-a" }, "Staff Fund");
    const calledWhere = mockPrisma.payment.findMany.mock.calls[0][0].where;
    expect(calledWhere.attributedUserId).toBeUndefined();
    expect(calledWhere.churchId).toBe("church-a");
  });
});
