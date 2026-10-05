import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The "Refresh from Finix" admin action — pulls the current Verification
 * on demand and re-parses it into updateRequestedItems, for applications
 * whose requirement was never populated because no new MERCHANT.UPDATED
 * webhook has arrived since the parsing fix shipped (2026-09-04: a real
 * application's updateRequestedItems was still null after that fix went
 * live, since nothing had backfilled it).
 */

vi.mock("@/lib/auth/session", () => ({ getAdminSession: vi.fn().mockResolvedValue({ userId: "admin-1" }) }));

const mockGetVerification = vi.fn();
const mockGetMerchant = vi.fn();
vi.mock("@/lib/finix/client", () => ({
  finixClient: {
    getVerification: (...a: unknown[]) => mockGetVerification(...a),
    getMerchant: (...a: unknown[]) => mockGetMerchant(...a),
  },
}));

const mockPrisma = {
  onboardingApplication: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../route");
}

function postReq() {
  return new Request("http://x/api/admin/onboarding-applications/app-1/refresh-verification", { method: "POST" });
}

const params = () => ({ params: Promise.resolve({ applicationId: "app-1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.onboardingApplication.update.mockResolvedValue({});
});

describe("POST /api/admin/onboarding-applications/[id]/refresh-verification", () => {
  it("uses the application's stored finixVerificationId, fetches it, and saves the parsed requested items", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      finixVerificationId: "VIrw87j7jgcPqAwJJfgtgWAX",
      finixMerchantId: "MU123",
      updateRequestedItems: null,
    });
    mockGetVerification.mockResolvedValue({
      state: "FAILED",
      outcomes: [{ outcome_code: "BUSINESS_MCC_UPDATE_REQUESTED" }],
    });

    const { POST } = await load();
    const res = await POST(postReq(), params());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetVerification).toHaveBeenCalledWith("VIrw87j7jgcPqAwJJfgtgWAX");
    expect(mockGetMerchant).not.toHaveBeenCalled();
    expect(data.outcomesFound).toBe(true);
    expect(data.requestedItems).toContain("Business mcc update requested");
    expect(mockPrisma.onboardingApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({ updateRequestedItems: expect.stringContaining("Business mcc update requested") }),
      })
    );
  });

  it("falls back to fetching the Merchant resource for the verification id when it isn't stored on the application", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      finixVerificationId: null,
      finixMerchantId: "MU123",
      updateRequestedItems: null,
    });
    mockGetMerchant.mockResolvedValue({ verification: "VIfallback123" });
    mockGetVerification.mockResolvedValue({ outcomes: [{ outcome_code: "X" }] });

    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(200);
    expect(mockGetMerchant).toHaveBeenCalledWith("MU123");
    expect(mockGetVerification).toHaveBeenCalledWith("VIfallback123");
  });

  it("400s when no verification id can be found anywhere", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      finixVerificationId: null,
      finixMerchantId: null,
      updateRequestedItems: null,
    });
    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(400);
    expect(mockGetVerification).not.toHaveBeenCalled();
  });

  it("keeps the existing updateRequestedItems (does not null it out) when Finix returns no outcomes", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      finixVerificationId: "VI1",
      finixMerchantId: "MU123",
      updateRequestedItems: "• Previously saved item",
    });
    mockGetVerification.mockResolvedValue({ outcomes: [] });

    const { POST } = await load();
    const res = await POST(postReq(), params());
    const data = await res.json();
    expect(data.outcomesFound).toBe(false);
    expect(data.requestedItems).toBe("• Previously saved item");
    expect(mockPrisma.onboardingApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ updateRequestedItems: "• Previously saved item" }) })
    );
  });

  it("502s when the Finix API call itself fails, without throwing", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      finixVerificationId: "VI1",
      finixMerchantId: "MU123",
      updateRequestedItems: null,
    });
    mockGetVerification.mockRejectedValue(new Error("network error"));

    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(502);
    expect(mockPrisma.onboardingApplication.update).not.toHaveBeenCalled();
  });

  it("404s when the application doesn't exist", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(404);
  });
});
