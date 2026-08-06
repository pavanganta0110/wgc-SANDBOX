import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = {
  client: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  donor: { findFirst: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function ownerAuth(churchId = "church-a") {
  return { userId: "u1", email: "owner@a.com", churchId, role: "owner", rawRole: "owner" };
}
function viewerAuth(churchId = "church-a") {
  return { userId: "u2", email: "viewer@a.com", churchId, role: "viewer", rawRole: "viewer" };
}

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

async function loadCreate() {
  vi.resetModules();
  return import("@/app/api/merchant/clients/create/route");
}
async function loadUpdate() {
  vi.resetModules();
  return import("@/app/api/merchant/clients/[clientId]/update/route");
}
async function loadArchive() {
  vi.resetModules();
  return import("@/app/api/merchant/clients/[clientId]/archive/route");
}
async function loadRestore() {
  vi.resetModules();
  return import("@/app/api/merchant/clients/[clientId]/restore/route");
}

describe("POST /api/merchant/clients/create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageClients", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await POST(req({ clientType: "INDIVIDUAL", firstName: "Jane" }));
    expect(res.status).toBe(403);
  });

  it("requires a name for an individual client", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth());
    const res = await POST(req({ clientType: "INDIVIDUAL" }));
    expect(res.status).toBe(400);
  });

  it("requires an organization name for an organization client", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth());
    const res = await POST(req({ clientType: "ORGANIZATION" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth());
    const res = await POST(req({ clientType: "INDIVIDUAL", firstName: "Jane", email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 with possible duplicates instead of creating, when a match exists", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.client.findMany.mockResolvedValue([
      { id: "c1", displayName: "Jane Smith", email: "jane@x.com", normalizedEmail: "jane@x.com", phone: null, normalizedPhone: null, organizationName: null },
    ]);
    const res = await POST(req({ clientType: "INDIVIDUAL", firstName: "Jane", lastName: "Smith", email: "jane@x.com" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.possibleDuplicates).toHaveLength(1);
    expect(mockPrisma.client.create).not.toHaveBeenCalled();
  });

  it("creates anyway when acknowledgeDuplicates is set, skipping the duplicate check", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.client.create.mockResolvedValue({ id: "c-new", displayName: "Jane Smith" });
    const res = await POST(req({ clientType: "INDIVIDUAL", firstName: "Jane", lastName: "Smith", acknowledgeDuplicates: true }));
    expect(res.status).toBe(200);
    expect(mockPrisma.client.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.client.create).toHaveBeenCalled();
  });

  it("scopes the created client to the caller's own church", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.client.create.mockResolvedValue({ id: "c-new", displayName: "Jane Smith" });
    await POST(req({ clientType: "INDIVIDUAL", firstName: "Jane", acknowledgeDuplicates: true }));
    const createCall = mockPrisma.client.create.mock.calls[0][0];
    expect(createCall.data.churchId).toBe("church-a");
  });

  it("rejects a linkedDonorId belonging to a different church", async () => {
    const { POST } = await loadCreate();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.donor.findFirst.mockResolvedValue(null);
    const res = await POST(req({ clientType: "INDIVIDUAL", firstName: "Jane", linkedDonorId: "donor-other-church", acknowledgeDuplicates: true }));
    expect(res.status).toBe(400);
    expect(mockPrisma.donor.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "donor-other-church", churchId: "church-a" } }));
    expect(mockPrisma.client.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/merchant/clients/[clientId]/update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for a client belonging to a different church", async () => {
    const { POST } = await loadUpdate();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.client.findFirst.mockResolvedValue(null);
    const res = await POST(req({ clientType: "INDIVIDUAL", firstName: "Jane" }), { params: Promise.resolve({ clientId: "c1" }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.client.findFirst).toHaveBeenCalledWith({ where: { id: "c1", churchId: "church-a" } });
  });

  it("requires canManageClients", async () => {
    const { POST } = await loadUpdate();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await POST(req({ clientType: "INDIVIDUAL", firstName: "Jane" }), { params: Promise.resolve({ clientId: "c1" }) });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/merchant/clients/[clientId]/archive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives an active client", async () => {
    const { POST } = await loadArchive();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1", archivedAt: null });
    mockPrisma.client.update.mockResolvedValue({});
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ clientId: "c1" }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.client.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ archivedAt: expect.any(Date) }) }));
  });

  it("is a no-op for an already-archived client", async () => {
    const { POST } = await loadArchive();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1", archivedAt: new Date() });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ clientId: "c1" }) });
    const data = await res.json();
    expect(data.alreadyArchived).toBe(true);
    expect(mockPrisma.client.update).not.toHaveBeenCalled();
  });

  it("requires canManageClients", async () => {
    const { POST } = await loadArchive();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ clientId: "c1" }) });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/merchant/clients/[clientId]/restore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores an archived client", async () => {
    const { POST } = await loadRestore();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1", archivedAt: new Date() });
    mockPrisma.client.update.mockResolvedValue({});
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ clientId: "c1" }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.client.update).toHaveBeenCalledWith(expect.objectContaining({ data: { archivedAt: null, archivedByUserId: null, archivedByEmail: null } }));
  });
});
