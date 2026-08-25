import { describe, it, expect, vi, beforeEach } from "vitest";

/** Item 35: "Saved reports — ownership and authorization." */

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { savedReport: { findFirst: (...a: unknown[]) => mockFindFirst(...a), update: (...a: unknown[]) => mockUpdate(...a), delete: (...a: unknown[]) => mockDelete(...a) } },
}));

const mockRequireMerchantSession = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockRequireMerchantSession() }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/auth/errors", () => ({ isAuthError: () => false }));

function makeReq(body: unknown) {
  return new Request("https://x", { method: "PATCH", body: JSON.stringify(body) });
}

describe("Saved report [id] route — ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the creator rename their own PRIVATE report", async () => {
    mockRequireMerchantSession.mockResolvedValue({ userId: "owner-1", churchId: "church-A" });
    mockFindFirst.mockResolvedValue({ id: "r1", churchId: "church-A", createdByUserId: "owner-1", visibility: "PRIVATE" });
    mockUpdate.mockResolvedValue({ id: "r1", name: "New Name" });
    const { PATCH } = await import("../route");

    const res = await PATCH(makeReq({ name: "New Name" }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("blocks a different user from editing someone else's PRIVATE report, even within the same church", async () => {
    mockRequireMerchantSession.mockResolvedValue({ userId: "other-user", churchId: "church-A" });
    mockFindFirst.mockResolvedValue({ id: "r1", churchId: "church-A", createdByUserId: "owner-1", visibility: "PRIVATE" });
    const { PATCH } = await import("../route");

    const res = await PATCH(makeReq({ name: "Hijacked" }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("lets a non-creator team member edit an ORGANIZATION-visibility report (team-shared)", async () => {
    mockRequireMerchantSession.mockResolvedValue({ userId: "other-user", churchId: "church-A" });
    mockFindFirst.mockResolvedValue({ id: "r1", churchId: "church-A", createdByUserId: "owner-1", visibility: "ORGANIZATION" });
    mockUpdate.mockResolvedValue({ id: "r1" });
    const { PATCH } = await import("../route");

    const res = await PATCH(makeReq({ name: "Team Edit" }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
  });

  it("404s when the report belongs to a different church entirely (findFirst scoped by churchId)", async () => {
    mockRequireMerchantSession.mockResolvedValue({ userId: "owner-1", churchId: "church-B" });
    mockFindFirst.mockResolvedValue(null); // findFirst was called with churchId: "church-B", so a church-A report never matches
    const { PATCH } = await import("../route");

    const res = await PATCH(makeReq({ name: "x" }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(404);
    expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-B" }) }));
  });

  it("delete follows the same ownership rule as edit", async () => {
    mockRequireMerchantSession.mockResolvedValue({ userId: "other-user", churchId: "church-A" });
    mockFindFirst.mockResolvedValue({ id: "r1", churchId: "church-A", createdByUserId: "owner-1", visibility: "PRIVATE" });
    const { DELETE } = await import("../route");

    const res = await DELETE(new Request("https://x"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
