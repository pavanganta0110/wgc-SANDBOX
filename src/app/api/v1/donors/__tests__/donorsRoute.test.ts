import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  apiRequestLog: { create: vi.fn().mockResolvedValue({}) },
  donor: { findMany: vi.fn(), create: vi.fn() },
  webhookEvent: { create: vi.fn().mockResolvedValue({ id: "evt1" }) },
  webhookEndpoint: { findMany: vi.fn().mockResolvedValue([]) },
  webhookDelivery: { create: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function req(method: string, body?: unknown, authHeader = "Bearer wgc_live_valid") {
  const headers = new Headers({ authorization: authHeader, "content-type": "application/json" });
  return new Request("http://x/api/v1/donors", { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

// withApiAuth's wrapped handlers always take a Next.js-style route context
// as their second argument (even collection routes with no dynamic
// segment — matches what Next.js's own generated route validator expects).
const emptyCtx = () => ({ params: Promise.resolve({}) });

describe("GET /api/v1/donors — tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("scopes the query to the authenticated key's own church, never a caller-supplied one", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "ACTIVE", scopesJson: ["donors:read"] });
    mockPrisma.donor.findMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    // Even if a caller tried to inject a different churchId via a query
    // param, the route never reads one — it only ever uses auth.churchId.
    const res = await GET(req("GET"), emptyCtx());

    expect(res.status).toBe(200);
    expect(mockPrisma.donor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-a" }) })
    );
  });

  it("returns 401 for an invalid key without ever querying donors", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);

    const { GET } = await import("../route");
    const res = await GET(req("GET"), emptyCtx());

    expect(res.status).toBe(401);
    expect(mockPrisma.donor.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the key lacks the donors:read scope", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "ACTIVE", scopesJson: ["campaigns:read"] });

    const { GET } = await import("../route");
    const res = await GET(req("GET"), emptyCtx());

    expect(res.status).toBe(403);
    expect(mockPrisma.donor.findMany).not.toHaveBeenCalled();
  });

  it("returns a structured error body with a requestId on failure", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);

    const { GET } = await import("../route");
    const res = await GET(req("GET"), emptyCtx());
    const data = await res.json();

    expect(data.error.type).toBe("authentication_error");
    expect(data.error.requestId).toMatch(/^req_/);
  });
});

describe("POST /api/v1/donors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "ACTIVE", scopesJson: ["donors:write"] });
  });

  it("creates the donor scoped to the key's church regardless of any churchId in the request body", async () => {
    mockPrisma.donor.create.mockResolvedValue({ id: "d1", name: "Jane", email: null, phone: null, anonymousPreference: false, createdAt: new Date(), updatedAt: new Date() });

    const { POST } = await import("../route");
    const res = await POST(req("POST", { name: "Jane", churchId: "church-b-attempted-injection" }), emptyCtx());

    expect(res.status).toBe(200);
    expect(mockPrisma.donor.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ churchId: "church-a" }) }));
  });

  it("rejects a request with no name", async () => {
    const { POST } = await import("../route");
    const res = await POST(req("POST", {}), emptyCtx());

    expect(res.status).toBe(400);
    expect(mockPrisma.donor.create).not.toHaveBeenCalled();
  });
});
