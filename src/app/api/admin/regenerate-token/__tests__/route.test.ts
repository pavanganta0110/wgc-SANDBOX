import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A fourth independent copy of the MORE_INFORMATION_REQUIRED email
 * template was found here during the same 2026-09-04 investigation —
 * refactored to use the shared buildOnboardingStatusEmailContent() like
 * the other three resend surfaces, including the legalBusinessName
 * fallback it was also missing.
 */

const mockSendWgcEmail = vi.fn().mockResolvedValue({ success: true, data: {} });
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendWgcEmail: (...a: unknown[]) => mockSendWgcEmail(...a) };
});

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

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

function postReq(body: unknown) {
  return new Request("http://x/api/admin/regenerate-token", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.onboardingApplication.update.mockResolvedValue({});
  mockGetAdminSession.mockResolvedValue({ userId: "admin_1", email: "admin@wgc.com", role: "wgc_admin" });
});

describe("POST /api/admin/regenerate-token", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq({ applicationId: "app-1" }));
    expect(res.status).toBe(401);
    expect(mockPrisma.onboardingApplication.findUnique).not.toHaveBeenCalled();
  });

  it("sends the real requested items and a secure link, and falls back to legalBusinessName", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "",
      legalBusinessName: "Lighthouse Baptist Church",
      updateRequestedItems: "• Business mcc (Update Data)",
    });
    const { POST } = await load();
    const res = await POST(postReq({ applicationId: "app-1" }));
    expect(res.status).toBe(200);

    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("Lighthouse Baptist Church");
    expect(call.bodyHtml).toContain("Business mcc (Update Data)");
    expect(call.bodyHtml).toMatch(/https:\/\/www\.wgcpayments\.com\/onboarding\/update\/[a-f0-9]{64}/);
    expect(call.bodyHtml).not.toContain("log in to your merchant dashboard");
  });

  it("forces onboardingStatus back to MORE_INFORMATION_REQUIRED and stores a fresh token", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Grace Church",
      updateRequestedItems: null,
    });
    const { POST } = await load();
    await POST(postReq({ applicationId: "app-1" }));

    expect(mockPrisma.onboardingApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({
          onboardingStatus: "MORE_INFORMATION_REQUIRED",
          updateTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      })
    );
  });

  it("rejects a missing applicationId", async () => {
    const { POST } = await load();
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("404s when the application doesn't exist", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq({ applicationId: "missing" }));
    expect(res.status).toBe(404);
  });
});
