import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockGetSystemHealthOverview = vi.fn();
vi.mock("@/lib/monitoring/overviewStats", () => ({ getSystemHealthOverview: () => mockGetSystemHealthOverview() }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/system-health/overview", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetSystemHealthOverview).not.toHaveBeenCalled();
  });

  it("returns the overview for an authenticated wgc_admin session", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin", email: "a@wgc.com" });
    mockGetSystemHealthOverview.mockResolvedValue({ overallStatus: "OPERATIONAL", activeErrors: 0 });
    const { GET } = await loadModule();
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.overallStatus).toBe("OPERATIONAL");
  });

  it("also allows a wgc_super_admin session", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u2", role: "wgc_super_admin", email: "b@wgc.com" });
    mockGetSystemHealthOverview.mockResolvedValue({ overallStatus: "OPERATIONAL" });
    const { GET } = await loadModule();
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
