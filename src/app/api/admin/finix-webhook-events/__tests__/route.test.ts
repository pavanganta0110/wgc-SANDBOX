import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = {
  finixWebhookEvent: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function req(query = "") {
  return new Request(`http://x/api/admin/finix-webhook-events${query}`);
}

async function loadRoute() {
  vi.resetModules();
  return import("../route");
}

describe("GET /api/admin/finix-webhook-events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an admin session", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockPrisma.finixWebhookEvent.findMany).not.toHaveBeenCalled();
  });

  it("filters by merchantId when provided", async () => {
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com" });
    mockPrisma.finixWebhookEvent.findMany.mockResolvedValue([]);

    const { GET } = await loadRoute();
    await GET(req("?merchantId=MU123"));

    expect(mockPrisma.finixWebhookEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ merchantId: "MU123" }) }));
  });

  it("returns events and distinct types for a plain request", async () => {
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com" });
    mockPrisma.finixWebhookEvent.findMany
      .mockResolvedValueOnce([{ id: "e1", type: "merchant.updated" }])
      .mockResolvedValueOnce([{ type: "merchant.updated" }, { type: "merchant.created" }]);

    const { GET } = await loadRoute();
    const res = await GET(req());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.events).toHaveLength(1);
    expect(data.types).toEqual(["merchant.updated", "merchant.created"]);
  });
});
