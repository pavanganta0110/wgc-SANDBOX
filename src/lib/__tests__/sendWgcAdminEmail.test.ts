import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 2026-09-05 bug report: "not seeing the emails that WGC admin got" — every
 * sendWgcAdminEmail() call (approval/rejection/more-info-required alerts,
 * webhook-failure alerts, orphaned-charge escalations) sent a real email via
 * Resend but never wrote anything to EmailLog, so the admin Email Logs page
 * (which only ever reads EmailLog) never showed them at all. These tests
 * cover the fix: sendWgcAdminEmail now logs unconditionally, success or
 * failure, the same way provisionChurchAccount.ts's DASHBOARD_ACCESS send
 * already did.
 */

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => mockSend(...a) };
  },
}));

const mockEmailLogCreate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({ prisma: { emailLog: { create: (...a: unknown[]) => mockEmailLogCreate(...a) } } }));

async function load() {
  vi.resetModules();
  process.env.RESEND_API_KEY = "test-key";
  return import("@/lib/email");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendWgcAdminEmail — EmailLog visibility", () => {
  it("logs a SENT EmailLog row on success, type-prefixed so it's never confused with the merchant-facing email for the same event", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend-1" }, error: null });
    const { sendWgcAdminEmail } = await load();

    await sendWgcAdminEmail({
      merchantName: "Grace Church",
      contactEmail: "contact@grace.example",
      newStatus: "APPROVED",
      whatHappened: "Finix approved the merchant onboarding application.",
      actionNeeded: "None.",
      adminDashboardLink: "https://www.wgcpayments.com/admin/merchant-applications",
      onboardingApplicationId: "app-1",
    });

    expect(mockEmailLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingApplicationId: "app-1",
          type: "WGC_ADMIN_APPROVED",
          status: "SENT",
        }),
      })
    );
  });

  it("logs an ERROR EmailLog row when the send fails, instead of leaving no trace at all", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "Resend down" } });
    const { sendWgcAdminEmail } = await load();

    const result = await sendWgcAdminEmail({
      merchantName: "System Alert",
      contactEmail: "N/A",
      newStatus: "WEBHOOK_FAILED",
      whatHappened: "Failed to process webhook event",
      actionNeeded: "Check logs.",
      adminDashboardLink: "https://www.wgcpayments.com/admin/merchant-applications",
    });

    expect(result.success).toBe(false);
    expect(mockEmailLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingApplicationId: null,
          type: "WGC_ADMIN_WEBHOOK_FAILED",
          status: "ERROR",
        }),
      })
    );
  });

  it("still returns the send result even if the EmailLog write itself fails — logging must never break the actual alert", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend-2" }, error: null });
    mockEmailLogCreate.mockRejectedValue(new Error("db down"));
    const { sendWgcAdminEmail } = await load();

    const result = await sendWgcAdminEmail({
      merchantName: "Grace Church",
      contactEmail: "contact@grace.example",
      newStatus: "REJECTED",
      whatHappened: "Finix rejected the application.",
      actionNeeded: "Review.",
      adminDashboardLink: "https://www.wgcpayments.com/admin/merchant-applications",
    });

    expect(result.success).toBe(true);
  });
});
