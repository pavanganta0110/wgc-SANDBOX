import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/givingLinks/validation", () => ({ generatePublicSlug: () => "slug123" }));

const mockCreate = vi.fn();
const mockFundFindFirst = vi.fn();
const mockGivingLinkFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pledgeCampaign: { create: (...args: unknown[]) => mockCreate(...args), findUnique: vi.fn() },
    fund: { findFirst: (...args: unknown[]) => mockFundFindFirst(...args) },
    givingLink: { findFirst: (...args: unknown[]) => mockGivingLinkFindFirst(...args) },
  },
}));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/pledge-campaigns/route");
}

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com", churchId: "church-a", role: "owner", rawRole: "owner" });
  mockCreate.mockResolvedValue({ id: "campaign-1", name: "Test", goalAmountCents: null });
});

/**
 * goalAmountCents/unitAmountCents are stored as Postgres `integer` columns
 * (max 2,147,483,647 = $21,474,836.47). A goal over that limit used to
 * reach prisma.pledgeCampaign.create() uncaught, Postgres rejected the
 * insert, and the merchant saw an opaque "Could not create campaign" with
 * no indication why — see the commit that added this test for the full
 * incident writeup. These assert the fix: a clear 400 before create() is
 * ever called, not a crash after.
 */
describe("POST /api/merchant/pledge-campaigns — goal/unit amount bounds", () => {
  it("rejects a goal amount over the Postgres integer max with a clear message, never reaching prisma.create", async () => {
    const { POST } = await loadRoute();
    // $32,000,000.00 — the exact value from the reported incident.
    const res = await POST(req({ name: "Building Fund 2027", goalAmountCents: 3_200_000_000 }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.message).toMatch(/too large/i);
    expect(data.error.message).toMatch(/21,474,836\.47/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a per-unit amount over the Postgres integer max the same way", async () => {
    const { POST } = await loadRoute();
    const res = await POST(req({ name: "Mile Walk", unitAmountCents: 3_000_000_000 }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error.message).toMatch(/too large/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("still accepts a large but in-range goal amount (just under the limit)", async () => {
    const { POST } = await loadRoute();
    mockCreate.mockResolvedValue({ id: "campaign-2", name: "Big Fund", goalAmountCents: 2_147_483_647 });
    const res = await POST(req({ name: "Big Fund", goalAmountCents: 2_147_483_647 }));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ goalAmountCents: 2_147_483_647 }) }));
  });

  it("still accepts a normal, modest goal amount", async () => {
    const { POST } = await loadRoute();
    mockCreate.mockResolvedValue({ id: "campaign-3", name: "Small Fund", goalAmountCents: 500_000 });
    const res = await POST(req({ name: "Small Fund", goalAmountCents: 500_000 }));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ goalAmountCents: 500_000 }) }));
  });
});
