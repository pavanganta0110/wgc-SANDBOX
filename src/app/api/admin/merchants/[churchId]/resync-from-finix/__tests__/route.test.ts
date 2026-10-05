import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockGetMerchant = vi.fn();
vi.mock("@/lib/finix/client", () => ({ finixClient: { getMerchant: (...a: unknown[]) => mockGetMerchant(...a) } }));

const mockHandleMerchantTermination = vi.fn();
vi.mock("@/lib/onboarding/handleMerchantTermination", () => ({ handleMerchantTermination: (...a: unknown[]) => mockHandleMerchantTermination(...a) }));

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = {
  church: { findUnique: vi.fn() },
  onboardingApplication: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function req() {
  return new Request("http://x", { method: "POST" });
}

async function loadRoute() {
  vi.resetModules();
  return import("../route");
}

describe("POST /api/admin/merchants/[churchId]/resync-from-finix", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an admin session", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(req(), { params: Promise.resolve({ churchId: "church-1" }) });
    expect(res.status).toBe(401);
  });

  it("404s for an unknown church", async () => {
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.church.findUnique.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(req(), { params: Promise.resolve({ churchId: "church-1" }) });
    expect(res.status).toBe(404);
  });

  it("rejects a church with no Finix Merchant ID on file", async () => {
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-1", finixMerchantId: null, status: "ACTIVE" });
    const { POST } = await loadRoute();
    const res = await POST(req(), { params: Promise.resolve({ churchId: "church-1" }) });
    expect(res.status).toBe(400);
    expect(mockGetMerchant).not.toHaveBeenCalled();
  });

  it("reports no change when Finix does not report the merchant terminated", async () => {
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-1", finixMerchantId: "MU123", status: "ACTIVE", onboardingApplicationId: null });
    mockGetMerchant.mockResolvedValue({ is_terminated: false });

    const { POST } = await loadRoute();
    const res = await POST(req(), { params: Promise.resolve({ churchId: "church-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.isTerminated).toBe(false);
    expect(mockHandleMerchantTermination).not.toHaveBeenCalled();
  });

  it("applies termination when Finix reports the merchant terminated", async () => {
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-1", finixMerchantId: "MU123", status: "ACTIVE", onboardingApplicationId: "app-1" });
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      onboardingStatus: "APPROVED",
      contactEmail: "chris@springfieldbsu.org",
      organizationName: "Springfield",
      legalBusinessName: null,
    });
    mockGetMerchant.mockResolvedValue({ is_terminated: true, termination_details: { reason: "CHURNED" } });
    mockHandleMerchantTermination.mockResolvedValue({ applied: true });

    const { POST } = await loadRoute();
    const res = await POST(req(), { params: Promise.resolve({ churchId: "church-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.isTerminated).toBe(true);
    expect(data.applied).toBe(true);
    expect(mockHandleMerchantTermination).toHaveBeenCalledWith(
      expect.objectContaining({ church: { id: "church-1", status: "ACTIVE" }, finixMerchantId: "MU123" })
    );
  });

  it("returns a 502 when the Finix API call fails, rather than a 500", async () => {
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-1", finixMerchantId: "MU123", status: "ACTIVE" });
    mockGetMerchant.mockRejectedValue(new Error("Finix Error: 500"));

    const { POST } = await loadRoute();
    const res = await POST(req(), { params: Promise.resolve({ churchId: "church-1" }) });
    expect(res.status).toBe(502);
  });
});
