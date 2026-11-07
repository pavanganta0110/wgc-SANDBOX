import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdmin = vi.fn();
vi.mock("@/lib/auth/requireAdminSession", () => ({ requireMfaVerifiedAdminSession: () => mockRequireAdmin() }));

const mockUpdateMerchant = vi.fn();
const mockGetMerchant = vi.fn();
vi.mock("@/lib/finix/client", () => ({
  finixClient: { updateMerchant: (...a: unknown[]) => mockUpdateMerchant(...a), getMerchant: (...a: unknown[]) => mockGetMerchant(...a) },
}));

const mockHandle = vi.fn();
vi.mock("@/lib/onboarding/handleMerchantTermination", () => ({ handleMerchantTermination: (...a: unknown[]) => mockHandle(...a) }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = { church: { findUnique: vi.fn() }, onboardingApplication: { findUnique: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const SUPER = { userId: "u1", email: "a@wgc.com", role: "wgc_super_admin" };
const CHURCH = { id: "c1", name: "Grace Church", finixMerchantId: "MU1", status: "ACTIVE", onboardingApplicationId: null };
const GOOD = { confirmName: "Grace Church", confirmWord: "TERMINATE", reason: "FRAUD", description: "Confirmed fraudulent activity" };

const call = async (body: unknown) => {
  const { POST } = await import("../route");
  return POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ churchId: "c1" }) });
};

describe("POST /api/admin/merchants/[churchId]/terminate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(SUPER);
    mockPrisma.church.findUnique.mockResolvedValue(CHURCH);
    mockUpdateMerchant.mockResolvedValue({});
    mockGetMerchant.mockResolvedValue({ is_terminated: true, termination_details: null });
    mockHandle.mockResolvedValue({ applied: true });
  });

  it("rejects a session that is not MFA-verified", async () => {
    const { ForbiddenError } = await import("@/lib/auth/errors");
    mockRequireAdmin.mockRejectedValue(new ForbiddenError("needs mfa"));
    expect((await call(GOOD)).status).toBe(403);
    expect(mockUpdateMerchant).not.toHaveBeenCalled();
  });

  it("rejects a non-super admin", async () => {
    mockRequireAdmin.mockResolvedValue({ ...SUPER, role: "wgc_admin" });
    expect((await call(GOOD)).status).toBe(403);
    expect(mockUpdateMerchant).not.toHaveBeenCalled();
  });

  it("rejects a wrong organization name", async () => {
    expect((await call({ ...GOOD, confirmName: "grace church" })).status).toBe(400);
    expect(mockUpdateMerchant).not.toHaveBeenCalled();
  });

  it("rejects a wrong confirmation word", async () => {
    expect((await call({ ...GOOD, confirmWord: "terminate" })).status).toBe(400);
    expect(mockUpdateMerchant).not.toHaveBeenCalled();
  });

  it("rejects a missing reason or short description", async () => {
    expect((await call({ ...GOOD, reason: "NOPE" })).status).toBe(400);
    expect((await call({ ...GOOD, description: "short" })).status).toBe(400);
    expect(mockUpdateMerchant).not.toHaveBeenCalled();
  });

  it("409s when already terminated", async () => {
    mockPrisma.church.findUnique.mockResolvedValue({ ...CHURCH, status: "TERMINATED" });
    expect((await call(GOOD)).status).toBe(409);
  });

  it("terminates at Finix and applies local handling", async () => {
    const res = await call(GOOD);
    expect(res.status).toBe(200);
    expect(mockUpdateMerchant).toHaveBeenCalledWith("MU1", { is_terminated: true });
    expect(mockHandle).toHaveBeenCalledOnce();
    expect(mockHandle.mock.calls[0][0].terminationDetails.description).toBe("FRAUD: Confirmed fraudulent activity");
  });

  it("changes nothing locally when Finix errors", async () => {
    mockUpdateMerchant.mockRejectedValue(new Error("403 forbidden"));
    expect((await call(GOOD)).status).toBe(502);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it("changes nothing locally when Finix does not report terminated", async () => {
    mockGetMerchant.mockResolvedValue({ is_terminated: false });
    expect((await call(GOOD)).status).toBe(502);
    expect(mockHandle).not.toHaveBeenCalled();
  });
});
