import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * This is the resend surface the user actually hit: the Email Logs page's
 * per-log "resend" button, a THIRD independent copy of the
 * MORE_INFORMATION_REQUIRED email logic (alongside merchant-applications'
 * "Resend Status Email" and the original MERCHANT.UPDATED webhook) — fixing
 * only the other two left this one still sending the generic "log in to
 * your merchant dashboard" text with no requirement and no link
 * (2026-09-04 finding, confirmed via a live screenshot). Now routes through
 * the single shared buildOnboardingStatusEmailContent() so this can't
 * silently drift from the other two again.
 */

vi.mock("@/lib/auth/session", () => ({ getAdminSession: vi.fn().mockResolvedValue({ userId: "admin-1" }) }));

const mockSendWgcEmail = vi.fn().mockResolvedValue({ success: true, data: {} });
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendWgcEmail: (...a: unknown[]) => mockSendWgcEmail(...a) };
});

const mockPrisma = {
  emailLog: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ id: "log-2" }) },
  onboardingApplication: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../resend/route");
}

function postReq(body?: unknown) {
  return new Request("http://x/api/admin/email-logs/log-1/resend", {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

const params = () => ({ params: Promise.resolve({ id: "log-1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.onboardingApplication.update.mockResolvedValue({});
});

describe("POST /api/admin/email-logs/[id]/resend — onboarding status emails", () => {
  it("falls back to legalBusinessName when organizationName is empty", async () => {
    mockPrisma.emailLog.findUnique.mockResolvedValue({ id: "log-1", type: "MORE_INFORMATION_REQUIRED", onboardingApplicationId: "app-1" });
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "",
      legalBusinessName: "Lighthouse Baptist Church",
      onboardingStatus: "MORE_INFORMATION_REQUIRED",
      updateRequestedItems: null,
    });
    const { POST } = await load();
    await POST(postReq(), params());
    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("Lighthouse Baptist Church");
    expect(call.bodyHtml).not.toContain("your organization");
  });

  it("MORE_INFORMATION_REQUIRED: sends real requested items and a secure link, not the old generic dashboard message", async () => {
    mockPrisma.emailLog.findUnique.mockResolvedValue({ id: "log-1", type: "MORE_INFORMATION_REQUIRED", onboardingApplicationId: "app-1" });
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Lighthouse Baptist Church",
      onboardingStatus: "MORE_INFORMATION_REQUIRED",
      updateRequestedItems: "• Business mcc (Update Data)",
    });
    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(200);

    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("Business mcc (Update Data)");
    expect(call.bodyHtml).toContain("Submit Required Information");
    expect(call.bodyHtml).toMatch(/https:\/\/www\.wgcpayments\.com\/onboarding\/update\/[a-f0-9]{64}/);
    expect(call.bodyHtml).not.toContain("log in to your merchant dashboard");

    expect(mockPrisma.onboardingApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({ updateTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      })
    );

    // The actual sent HTML is now stored so it can be viewed later from
    // the admin Email Logs page (2026-09-04 request).
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bodyHtml: call.bodyHtml }) })
    );
  });

  it("handles the ADMIN_RESEND_ prefixed log type the same way (a resend-of-a-resend)", async () => {
    mockPrisma.emailLog.findUnique.mockResolvedValue({ id: "log-1", type: "ADMIN_RESEND_MORE_INFORMATION_REQUIRED", onboardingApplicationId: "app-1" });
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Lighthouse Baptist Church",
      onboardingStatus: "MORE_INFORMATION_REQUIRED",
      updateRequestedItems: null,
    });
    const { POST } = await load();
    await POST(postReq(), params());

    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("Additional documentation is required to verify your business and identity.");
    expect(call.bodyHtml).toContain("Submit Required Information");
  });

  it("APPROVED does not generate a token", async () => {
    mockPrisma.emailLog.findUnique.mockResolvedValue({ id: "log-1", type: "APPROVED", onboardingApplicationId: "app-1" });
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Grace Church",
      onboardingStatus: "APPROVED",
    });
    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingApplication.update).not.toHaveBeenCalled();
  });

  it("404s when the email log itself doesn't exist", async () => {
    mockPrisma.emailLog.findUnique.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(404);
  });

  it("passes parsed additionalRecipients through as cc on the underlying send", async () => {
    mockPrisma.emailLog.findUnique.mockResolvedValue({ id: "log-1", type: "APPROVED", onboardingApplicationId: "app-1" });
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Grace Church",
      onboardingStatus: "APPROVED",
    });
    const { POST } = await load();
    await POST(postReq({ additionalRecipients: "spouse@example.com, Bookkeeper@Example.com" }), params());

    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.cc).toEqual(["spouse@example.com", "bookkeeper@example.com"]);
  });

  it("resends fine with no cc at all when no body is sent — unchanged prior behavior", async () => {
    mockPrisma.emailLog.findUnique.mockResolvedValue({ id: "log-1", type: "APPROVED", onboardingApplicationId: "app-1" });
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      id: "app-1",
      contactEmail: "contact@example.com",
      organizationName: "Grace Church",
      onboardingStatus: "APPROVED",
    });
    const { POST } = await load();
    const res = await POST(postReq(), params());
    expect(res.status).toBe(200);
    expect(mockSendWgcEmail.mock.calls[0][0].cc).toEqual([]);
  });
});
