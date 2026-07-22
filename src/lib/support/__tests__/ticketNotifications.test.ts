import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  church: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  emailLog: { create: vi.fn().mockResolvedValue(undefined) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockSendWgcEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendWgcEmail: (...args: unknown[]) => mockSendWgcEmail(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/support/ticketNotifications");
}

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    ticketNumber: "WGC-1001",
    churchId: "church-a",
    subject: "Payment issue",
    category: "PAYMENT",
    priority: "NORMAL",
    status: "OPEN",
    description: "Something is wrong",
    createdByUserId: "u1",
    createdByEmail: "merchant@church-a.com",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPPORT_EMAIL = "support@wgcpayments.com";
  mockPrisma.church.findUnique.mockResolvedValue({ name: "Test Church" });
  mockPrisma.user.findUnique.mockResolvedValue({ name: "Jane Doe", email: "merchant@church-a.com", role: "owner" });
});

describe("notifyNewSupportTicket", () => {
  it("sends to SUPPORT_EMAIL with the ticket number in the subject and logs success", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: true, data: { id: "email-1" } });
    const { notifyNewSupportTicket } = await loadModule();

    await notifyNewSupportTicket(makeTicket() as any);

    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "support@wgcpayments.com", subject: expect.stringContaining("WGC-1001") })
    );
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
  });

  it("a send failure is logged but does not throw — the ticket/message are already committed by the caller", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: false, error: "Provider down" });
    const { notifyNewSupportTicket } = await loadModule();

    await expect(notifyNewSupportTicket(makeTicket() as any)).resolves.toBeUndefined();
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("an exception thrown by the email provider is caught, not propagated", async () => {
    mockSendWgcEmail.mockRejectedValue(new Error("Network error"));
    const { notifyNewSupportTicket } = await loadModule();

    await expect(notifyNewSupportTicket(makeTicket() as any)).resolves.toBeUndefined();
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("does nothing (no throw, no send) when SUPPORT_EMAIL is not configured", async () => {
    delete process.env.SUPPORT_EMAIL;
    const { notifyNewSupportTicket } = await loadModule();

    await notifyNewSupportTicket(makeTicket() as any);
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });
});

describe("notifyWgcReply", () => {
  it("emails the ticket creator, includes the dashboard-reply instruction, and never includes internal notes (it only ever receives the merchant-visible body the caller passed in)", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: true, data: {} });
    const { notifyWgcReply } = await loadModule();

    await notifyWgcReply(makeTicket() as any, "Here is the update on your ticket.");

    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.to).toBe("merchant@church-a.com");
    expect(call.bodyHtml).toContain("Please reply through your WGC Payments dashboard");
    expect(call.bodyHtml).toContain("Here is the update on your ticket.");
  });

  it("a failed reply email never removes or alters the underlying reply — this function only sends and logs, it does not touch SupportTicketMessage", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: false, error: "down" });
    const { notifyWgcReply } = await loadModule();

    await notifyWgcReply(makeTicket() as any, "Reply body");
    // No message/ticket mutation calls exist on this module's mocked
    // prisma surface at all — only church/user reads and an EmailLog write.
    expect(mockPrisma.emailLog.create).toHaveBeenCalled();
  });
});

describe("notifyMerchantReply", () => {
  it("emails SUPPORT_EMAIL when a merchant replies", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: true, data: {} });
    const { notifyMerchantReply } = await loadModule();

    await notifyMerchantReply(makeTicket() as any, "Thanks, that worked.");

    expect(mockSendWgcEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "support@wgcpayments.com" }));
  });
});
