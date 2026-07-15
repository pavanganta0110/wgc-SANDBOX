import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(donors: any[] = []) {
  return {
    donor: { findMany: vi.fn().mockResolvedValue(donors) },
    finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
    finixTransfer: { findMany: vi.fn().mockResolvedValue([]) },
    finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([]) },
    bankReturn: { findMany: vi.fn().mockResolvedValue([]) },
    finixDispute: { findMany: vi.fn().mockResolvedValue([]) },
    finixSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("loadDonorsList — tenant isolation", () => {
  beforeEach(() => vi.resetModules());

  it("scopes the base donor query by the requesting organization's churchId", async () => {
    const prismaMock = makePrismaMock([]);
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorsList } = await import("@/lib/donors/donorsList");

    await loadDonorsList("church-A", {}, { key: "createdAt", dir: "desc" }, 1, 25);

    expect(prismaMock.donor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) }),
    );
  });

  it("excludes archived donors by default", async () => {
    const prismaMock = makePrismaMock([]);
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorsList } = await import("@/lib/donors/donorsList");

    await loadDonorsList("church-A", {}, { key: "createdAt", dir: "desc" }, 1, 25);

    expect(prismaMock.donor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ archivedAt: null }) }),
    );
  });

  it("includes archived donors only when archivedStatus is explicitly 'archived'", async () => {
    const prismaMock = makePrismaMock([]);
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorsList } = await import("@/lib/donors/donorsList");

    await loadDonorsList("church-A", { archivedStatus: "archived" }, { key: "createdAt", dir: "desc" }, 1, 25);

    const where = prismaMock.donor.findMany.mock.calls[0][0].where;
    expect(where.archivedAt).toEqual({ not: null });
  });
});

describe("loadDonorsList — search and pagination", () => {
  beforeEach(() => vi.resetModules());

  it("paginates results according to page/pageSize", async () => {
    const donors = Array.from({ length: 30 }, (_, i) => ({
      id: `D${i}`,
      churchId: "church-A",
      name: `Donor ${i}`,
      createdAt: new Date(2026, 0, i + 1),
      archivedAt: null,
    }));
    const prismaMock = makePrismaMock(donors);
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorsList } = await import("@/lib/donors/donorsList");

    const page1 = await loadDonorsList("church-A", {}, { key: "createdAt", dir: "desc" }, 1, 10);
    const page2 = await loadDonorsList("church-A", {}, { key: "createdAt", dir: "desc" }, 2, 10);

    expect(page1.rows).toHaveLength(10);
    expect(page2.rows).toHaveLength(10);
    expect(page1.totalCount).toBe(30);
    expect(page1.rows[0].donor.id).not.toBe(page2.rows[0].donor.id);
  });

  it("sorts by name ascending/descending", async () => {
    const donors = [
      { id: "D1", churchId: "church-A", name: "Zeta", createdAt: new Date(2026, 0, 1), archivedAt: null },
      { id: "D2", churchId: "church-A", name: "Alpha", createdAt: new Date(2026, 0, 2), archivedAt: null },
    ];
    const prismaMock = makePrismaMock(donors);
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { loadDonorsList } = await import("@/lib/donors/donorsList");

    const asc = await loadDonorsList("church-A", {}, { key: "name", dir: "asc" }, 1, 10);
    expect(asc.rows.map((r) => r.donor.name)).toEqual(["Alpha", "Zeta"]);
  });
});
