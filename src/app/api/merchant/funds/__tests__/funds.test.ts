import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));

const mockPrisma = {
  fund: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
  payment: { update: vi.fn(), findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadListCreateRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/funds/route");
}
async function loadDetailRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/funds/[fundId]/route");
}

function req(body?: any, method = "POST") {
  return new Request("http://x/api/merchant/funds", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/merchant/funds — admin can add custom funds", () => {
  it("owner/admin can create a new custom fund scoped to their church", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", role: "owner", rawRole: "owner", email: "owner@a.com" });
    mockPrisma.fund.findUnique.mockResolvedValue(null);
    mockPrisma.fund.aggregate.mockResolvedValue({ _max: { displayOrder: 2 } });
    mockPrisma.fund.create.mockResolvedValue({ id: "fund-new", churchId: "church-a", name: "Youth Ministry", description: null, displayOrder: 3, isActive: true });

    const { POST } = await loadListCreateRoute();
    const res = await POST(req({ name: "Youth Ministry" }));
    expect(res.status).toBe(201);
    expect(mockPrisma.fund.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ churchId: "church-a", name: "Youth Ministry" }) })
    );
  });

  it("a fundraiser without canManageOrgSettings is rejected", async () => {
    mockAuth.mockResolvedValue({ userId: "fund-1", churchId: "church-a", role: "fundraiser", rawRole: "fundraiser", email: "f@a.com" });

    const { POST } = await loadListCreateRoute();
    const res = await POST(req({ name: "Youth Ministry" }));
    expect(res.status).toBe(401);
    expect(mockPrisma.fund.create).not.toHaveBeenCalled();
  });

  it("rejects an empty fund name", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", role: "owner", rawRole: "owner", email: "owner@a.com" });

    const { POST } = await loadListCreateRoute();
    const res = await POST(req({ name: "   " }));
    expect(res.status).toBe(400);
    expect(mockPrisma.fund.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/merchant/funds/[fundId] — archive instead of delete, and never touches Payment", () => {
  it("archiving a fund (isActive: false) only updates the Fund row, never any Payment", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", role: "owner", rawRole: "owner", email: "owner@a.com" });
    mockPrisma.fund.findFirst.mockResolvedValue({ id: "fund-1", churchId: "church-a", name: "General Fund" });
    mockPrisma.fund.update.mockResolvedValue({ id: "fund-1", isActive: false });

    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(req({ isActive: false }, "PATCH"), { params: Promise.resolve({ fundId: "fund-1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.fund.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fund-1" }, data: expect.objectContaining({ isActive: false }) })
    );
    // Archiving must never touch historical Payment rows — the fund route
    // has no payment.update in its dependency graph at all in this test.
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });

  it("rejects patching a fund that belongs to a different church", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", role: "owner", rawRole: "owner", email: "owner@a.com" });
    // findFirst is scoped by { id, churchId: auth.churchId } in the route,
    // so a cross-church fund id simply never matches — returns null.
    mockPrisma.fund.findFirst.mockResolvedValue(null);

    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(req({ isActive: false }, "PATCH"), { params: Promise.resolve({ fundId: "fund-1" }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.fund.update).not.toHaveBeenCalled();
  });

  it("renaming a fund updates only the catalog row — old Payment.fundName snapshots are untouched by this route", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", role: "owner", rawRole: "owner", email: "owner@a.com" });
    mockPrisma.fund.findFirst.mockResolvedValue({ id: "fund-1", churchId: "church-a", name: "Old Name" }); // ownership check
    mockPrisma.fund.findUnique.mockResolvedValue(null); // no name conflict
    mockPrisma.fund.update.mockResolvedValue({ id: "fund-1", name: "New Name" });

    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(req({ name: "New Name" }, "PATCH"), { params: Promise.resolve({ fundId: "fund-1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });
});
