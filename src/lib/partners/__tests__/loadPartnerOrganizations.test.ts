import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  church: { findMany: vi.fn() },
  payment: { groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { loadPartnerOrganizations } from "../loadPartnerOrganizations";

beforeEach(() => vi.clearAllMocks());

describe("loadPartnerOrganizations", () => {
  it("only asks for the given partner's organizations", async () => {
    prismaMock.church.findMany.mockResolvedValue([]);
    await loadPartnerOrganizations("p_1");
    expect(prismaMock.church.findMany.mock.calls[0][0].where).toEqual({ partnerId: "p_1" });
    expect(prismaMock.payment.groupBy).not.toHaveBeenCalled();
  });

  it("totals only succeeded gifts for those organizations", async () => {
    const created = new Date("2026-01-01T00:00:00Z");
    prismaMock.church.findMany.mockResolvedValue([
      { id: "c_1", name: "Grace", partnerReference: "loc_1", status: "ACTIVE", createdAt: created },
      { id: "c_2", name: "Hope", partnerReference: null, status: "ACTIVE", createdAt: created },
    ]);
    const last = new Date("2026-02-01T00:00:00Z");
    prismaMock.payment.groupBy.mockResolvedValue([{ churchId: "c_1", _count: { _all: 3 }, _sum: { amountCents: 15000 }, _max: { createdAt: last } }]);

    const rows = await loadPartnerOrganizations("p_1");
    const where = prismaMock.payment.groupBy.mock.calls[0][0].where;
    expect(where).toEqual({ churchId: { in: ["c_1", "c_2"] }, status: "SUCCEEDED" });
    expect(rows[0]).toMatchObject({ id: "c_1", reference: "loc_1", giftCount: 3, giftTotalCents: 15000, lastGiftAt: last });
    expect(rows[1]).toMatchObject({ id: "c_2", giftCount: 0, giftTotalCents: 0, lastGiftAt: null });
  });
});
