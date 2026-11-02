import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  donor: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  finixTransfer: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { intersectIdSets, normalizeSearchQuery, parseSearchAmountCents, resolveSearchMatchedTransferIds } from "@/lib/payments/search";

describe("parseSearchAmountCents", () => {
  it("reads plain and formatted amounts as cents", () => {
    expect(parseSearchAmountCents("25")).toBe(2500);
    expect(parseSearchAmountCents("$1,250.50")).toBe(125050);
    expect(parseSearchAmountCents("99.9")).toBe(9990);
  });

  it("returns null for anything that is not purely an amount", () => {
    expect(parseSearchAmountCents("S-100")).toBeNull();
    expect(parseSearchAmountCents("Jane Doe")).toBeNull();
    expect(parseSearchAmountCents("12.345")).toBeNull();
    expect(parseSearchAmountCents("0")).toBeNull();
    expect(parseSearchAmountCents("")).toBeNull();
  });
});

describe("normalizeSearchQuery", () => {
  it("trims, collapses spaces and caps the length", () => {
    expect(normalizeSearchQuery("  Jane   Doe ")).toBe("Jane Doe");
    expect(normalizeSearchQuery(null)).toBe("");
    expect(normalizeSearchQuery("x".repeat(500))).toHaveLength(100);
  });
});

describe("intersectIdSets", () => {
  it("is null when no filter applied", () => {
    expect(intersectIdSets([null, null])).toBeNull();
  });

  it("returns a single applied set as is", () => {
    expect(intersectIdSets([null, ["a", "b"]])).toEqual(["a", "b"]);
  });

  it("keeps only ids present in every applied set", () => {
    expect(intersectIdSets([["a", "b", "c"], null, ["b", "c", "d"], ["c"]])).toEqual(["c"]);
  });

  it("is empty when the filters do not overlap", () => {
    expect(intersectIdSets([["a"], ["b"]])).toEqual([]);
  });
});

describe("resolveSearchMatchedTransferIds", () => {
  const scopes = { churchId: "church-1", paymentScope: { churchId: "church-1" }, transferScope: { churchId: "church-1" } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.donor.findMany.mockResolvedValue([]);
    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.finixTransfer.findMany.mockResolvedValue([]);
  });

  it("returns nothing for an empty query without touching the database", async () => {
    expect(await resolveSearchMatchedTransferIds({ ...scopes, query: "   " })).toEqual([]);
    expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();
  });

  it("matches on note, term and transaction id, scoped to the viewer's payments", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([{ finixTransferId: "TR_1" }]);
    const ids = await resolveSearchMatchedTransferIds({ ...scopes, query: "previous semester" });
    expect(ids).toEqual(["TR_1"]);
    const where = mockPrisma.payment.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ churchId: "church-1" });
    const fields = where.AND[2].OR.flatMap((c: object) => Object.keys(c));
    expect(fields).toEqual(expect.arrayContaining(["note", "studentTermLabel", "finixTransferId"]));
  });

  it("adds the matching student and donor ids", async () => {
    mockPrisma.student.findMany.mockResolvedValue([{ id: "stu-1" }]);
    mockPrisma.donor.findMany.mockResolvedValue([{ id: "don-1" }]);
    await resolveSearchMatchedTransferIds({ ...scopes, query: "S-100" });
    const or = mockPrisma.payment.findMany.mock.calls[0][0].where.AND[2].OR;
    expect(or).toContainEqual({ studentId: { in: ["stu-1"] } });
    expect(or).toContainEqual({ donorId: { in: ["don-1"] } });
  });

  it("matches an amount against both payment amounts and bare transfers", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([{ finixTransferId: "TR_1" }]);
    mockPrisma.finixTransfer.findMany.mockResolvedValue([{ finixTransferId: "TR_1" }, { finixTransferId: "TR_2" }]);
    const ids = await resolveSearchMatchedTransferIds({ ...scopes, query: "$25.00" });
    expect(ids.sort()).toEqual(["TR_1", "TR_2"]);
    const or = mockPrisma.payment.findMany.mock.calls[0][0].where.AND[2].OR;
    expect(or).toContainEqual({ amountCents: 2500 });
    expect(or).toContainEqual({ donationAmountCents: 2500 });
  });

  it("does not look up bare transfers for a text query", async () => {
    await resolveSearchMatchedTransferIds({ ...scopes, query: "Jane" });
    expect(mockPrisma.finixTransfer.findMany).not.toHaveBeenCalled();
  });
});
