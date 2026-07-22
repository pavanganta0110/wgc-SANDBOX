import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));

const mockPrisma = {
  donor: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockResolveOrCreateDonor = vi.fn();
vi.mock("@/lib/donors/resolveOrCreateDonor", () => ({
  resolveOrCreateDonor: (...args: unknown[]) => mockResolveOrCreateDonor(...args),
}));

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/donors/import/commit/route");
}

function req(csvText: string) {
  return new Request("http://x/api/merchant/donors/import/commit", {
    method: "POST",
    body: JSON.stringify({ csvText }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", email: "owner@a.com" });
  mockPrisma.donor.findMany.mockResolvedValue([{ normalizedEmail: "donor@example.com" }]);
});

describe("POST /api/merchant/donors/import/commit — canonical resolver adoption", () => {
  it("importing a normalized email that already exists in the org reuses/updates that donor instead of creating a duplicate", async () => {
    mockResolveOrCreateDonor.mockResolvedValue({ id: "existing-donor", created: false, updated: true });

    const { POST } = await loadModule();
    const res = await POST(req("Name,Email\nJane Doe,donor@example.com"));
    const data = await res.json();

    expect(mockResolveOrCreateDonor).toHaveBeenCalledWith(expect.objectContaining({ churchId: "church-a", email: "donor@example.com" }));
    expect(data.created).toBe(0);
    expect(data.updated).toBe(1);
  });

  it("importing a brand-new email creates exactly one donor", async () => {
    mockPrisma.donor.findMany.mockResolvedValue([]);
    mockResolveOrCreateDonor.mockResolvedValue({ id: "new-donor", created: true, updated: false });

    const { POST } = await loadModule();
    const res = await POST(req("Name,Email\nNew Donor,new@example.com"));
    const data = await res.json();

    expect(data.created).toBe(1);
    expect(mockResolveOrCreateDonor).toHaveBeenCalledTimes(1);
  });

  it("the same normalized email repeated twice within one file only resolves once", async () => {
    mockPrisma.donor.findMany.mockResolvedValue([]);
    mockResolveOrCreateDonor.mockResolvedValue({ id: "new-donor", created: true, updated: false });

    const { POST } = await loadModule();
    const res = await POST(req("Name,Email\nJane Doe,dup@example.com\nJane D,dup@example.com"));
    const data = await res.json();

    expect(mockResolveOrCreateDonor).toHaveBeenCalledTimes(1);
    expect(data.created).toBe(1);
    expect(data.rejected).toBe(1);
  });

  it("rows that fail validation are rejected without calling the resolver", async () => {
    const { POST } = await loadModule();
    const res = await POST(req("Name,Email\nNo Email Row,"));
    const data = await res.json();

    expect(mockResolveOrCreateDonor).not.toHaveBeenCalled();
    expect(data.rejected).toBe(1);
  });
});
