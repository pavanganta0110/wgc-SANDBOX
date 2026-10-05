import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the MORE_INFORMATION_REQUIRED resend fix: this admin action
 * previously sent a generic "log in to your dashboard" message with no
 * secure link and no real requirement — merchants have no login at this
 * onboarding stage, and it silently diverged from the original
 * MERCHANT.UPDATED webhook email (2026-09-04 finding: an admin resend for
 * a real merchant would never have shown Finix's actual requirements).
 */

const mockSendWgcEmail = vi.fn().mockResolvedValue({ success: true, data: {} });
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendWgcEmail: (...a: unknown[]) => mockSendWgcEmail(...a) };
});

const mockPrisma = {
  onboardingApplication: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  emailLog: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

async function load() {
  vi.resetModules();
  return import("../route");
}

function postReq(body: unknown) {
  return new Request("http://x/api/admin/resend-email", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.onboardingApplication.update.mockResolvedValue({});
  mockGetAdminSession.mockResolvedValue({ userId: "admin_1", email: "admin@wgc.com", role: "wgc_admin" });
});

describe("POST /api/admin/resend-email — auth", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq({ applicationId: "app-1" }));
    expect(res.status).toBe(401);
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/resend-email — MORE_INFORMATION_REQUIRED", () => {
  it("falls back to legalBusinessName when organizationName is empty (a real production application had this)", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "",
      legalBusinessName: "Lighthouse Baptist Church",
      onboardingStatus: "MORE_INFORMATION_REQUIRED",
      updateRequestedItems: null,
    });
    const { POST } = await load();
    await POST(postReq({ applicationId: "app-1" }));
    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("Lighthouse Baptist Church");
    expect(call.bodyHtml).not.toContain("your organization");
  });

  it("sends the real requested items and a secure link, not the old generic message", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Lighthouse Baptist Church",
      onboardingStatus: "MORE_INFORMATION_REQUIRED",
      updateRequestedItems: "• Business mcc (Update Data)\n• Business dba (Update Data)",
    });
    const { POST } = await load();
    const res = await POST(postReq({ applicationId: "app-1" }));
    expect(res.status).toBe(200);

    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyHtml: expect.stringContaining("Business mcc (Update Data)"),
      })
    );
    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("Submit Required Information");
    expect(call.bodyHtml).toMatch(/https:\/\/www\.wgcpayments\.com\/onboarding\/update\/[a-f0-9]{64}/);
    // No longer the old "log in to your dashboard" generic text.
    expect(call.bodyHtml).not.toContain("log in to your merchant dashboard");

    // The actual sent HTML is now stored so it can be viewed later from
    // the admin Email Logs page (2026-09-04 request) — previously nothing
    // recorded what an email actually said.
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bodyHtml: call.bodyHtml }) })
    );
  });

  it("regenerates and stores a fresh secure token on every resend, so an expired/used link is replaced", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Lighthouse Baptist Church",
      onboardingStatus: "MORE_INFORMATION_REQUIRED",
      updateRequestedItems: null,
    });
    const { POST } = await load();
    await POST(postReq({ applicationId: "app-1" }));

    expect(mockPrisma.onboardingApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({
          updateTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          updateTokenExpiresAt: expect.any(Date),
        }),
      })
    );
  });

  it("falls back to the generic requirement text when updateRequestedItems is empty, but still includes a working secure link", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Lighthouse Baptist Church",
      onboardingStatus: "ADDITIONAL_INFO_NEEDED",
      updateRequestedItems: null,
    });
    const { POST } = await load();
    await POST(postReq({ applicationId: "app-1" }));

    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("Additional documentation is required to verify your business and identity.");
    expect(call.bodyHtml).toContain("Submit Required Information");
  });
});

describe("POST /api/admin/resend-email — other statuses are unaffected", () => {
  it("APPROVED does not generate a token or touch updateRequestedItems", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Grace Church",
      onboardingStatus: "APPROVED",
    });
    const { POST } = await load();
    await POST(postReq({ applicationId: "app-1" }));

    expect(mockPrisma.onboardingApplication.update).not.toHaveBeenCalled();
    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).not.toContain("Submit Required Information");
  });
});

describe("POST /api/admin/resend-email — validation", () => {
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
