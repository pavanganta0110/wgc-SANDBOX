import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyTicketStatusChange, notifyTicketResolved, notifyAdminSupportChange } from "@/lib/support/ticketNotifications";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    church: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    emailLog: { create: vi.fn().mockResolvedValue(undefined) },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    supportTicket: { update: vi.fn() },
  }
}));

const mockSendWgcEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendWgcEmail: (...args: unknown[]) => mockSendWgcEmail(...args),
}));

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    ticketNumber: "WGC-1001",
    churchId: "church-a",
    subject: "Payout inquiry",
    category: "PAYMENT",
    priority: "NORMAL",
    status: "OPEN",
    description: "Please help with my payout",
    createdByUserId: "u1",
    createdByEmail: "merchant@church-a.com",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPPORT_EMAIL = "support@wgcpayments.com";
  vi.mocked(prisma.church.findUnique).mockResolvedValue({ name: "Test Church" } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: "Jane Doe", email: "merchant@church-a.com", role: "owner" } as any);
});

describe("Ticket Resolution & Status Change Emails", () => {
  it("resolving a ticket sends the merchant an email with resolution summary", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: true });
    await notifyTicketResolved(makeTicket() as any, "Resolved by updating routing table.");

    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "merchant@church-a.com",
        subject: "WGC Support resolved ticket WGC-1001",
        bodyHtml: expect.stringContaining("Resolved by updating routing table."),
      })
    );
    expect(prisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "SUPPORT_TICKET_RESOLVED", status: "SENT" }),
      })
    );
  });

  it("reopening a ticket sends a reopen email to the merchant", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: true });
    await notifyTicketStatusChange(makeTicket({ status: "IN_PROGRESS" }) as any, true);

    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "merchant@church-a.com",
        subject: "WGC Support reopened ticket WGC-1001",
        bodyHtml: expect.stringContaining("Reopened"),
      })
    );
  });

  it("closing a ticket sends a closed email to the merchant", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: true });
    await notifyTicketStatusChange(makeTicket({ status: "CLOSED" }) as any, false);

    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "merchant@church-a.com",
        subject: "WGC Support closed ticket WGC-1001",
        bodyHtml: expect.stringContaining("CLOSED"),
      })
    );
  });
});

describe("Admin Support Actions & User Email Notification", () => {
  it("approved support change emails the user with details, reason and ticket info without leaking secrets", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: true });
    await notifyAdminSupportChange({
      churchName: "Test Church",
      affectedUserName: "Jane Doe",
      affectedUserEmail: "jane@testchurch.org",
      changeDescription: "User sessions revoked due to security lock request",
      reason: "Merchant requested support via phone",
      ticketNumber: "WGC-1005",
    });

    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@testchurch.org",
        subject: "Security Notification: Support update to your WGC Payments account",
        bodyHtml: expect.stringContaining("User sessions revoked due to security lock request"),
      })
    );
    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyHtml: expect.stringContaining("Merchant requested support via phone"),
      })
    );
    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyHtml: expect.stringContaining("WGC-1005"),
      })
    );

    // Ensure no secrets are leaked in the email html string
    const html = mockSendWgcEmail.mock.calls[0][0].bodyHtml;
    expect(html).not.toContain("password");
    expect(html).not.toContain("token");
    expect(html).not.toContain("CVV");
    expect(html).not.toContain("API");
  });
});

describe("Internal Support View & Read-Only Constraints", () => {
  it("wgc_admin role is read-only by default and cannot modify settings", () => {
    const permissions = getSettingsPermissions("wgc_admin");
    expect(permissions.canEdit).toBe(false);
  });

  it("wgc_admin role cannot modify organization settings", () => {
    const permissions = getOrganizationPermissions("wgc_admin");
    expect(permissions.canUpdateBankAccount).toBe(false);
    expect(permissions.canEditProfile).toBe(false);
  });
});
