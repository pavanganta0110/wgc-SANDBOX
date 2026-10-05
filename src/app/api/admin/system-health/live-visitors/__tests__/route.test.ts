import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockGetLiveVisitorSnapshot = vi.fn();
vi.mock("@/lib/monitoring/liveVisitors", () => ({ getLiveVisitorSnapshot: () => mockGetLiveVisitorSnapshot() }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/system-health/live-visitors", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetLiveVisitorSnapshot).not.toHaveBeenCalled();
  });

  it("returns the snapshot for an authenticated admin, even when PostHog isn't configured", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockGetLiveVisitorSnapshot.mockResolvedValue({ configured: false, totalLiveVisitors: 0, topPages: [], devices: [], countries: [], referrers: [], error: null });
    const { GET } = await loadModule();
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.configured).toBe(false);
  });
});
