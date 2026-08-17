import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendWgcEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendWgcEmail: (opts: unknown) => mockSendWgcEmail(opts) }));

const mockPrisma: any = {
  billingEmailLog: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("@/lib/billing/billingEmails");
}

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    organizationId: "church-1",
    recipientEmail: "merchant@example.com",
    emailType: "SUBSCRIPTION_ACTIVATION" as const,
    idempotencyKey: "church-1:SUBSCRIPTION_ACTIVATION",
    subject: "Activate your subscription",
    title: "Activate",
    bodyHtml: "<p>go</p>",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.billingEmailLog.findUnique.mockResolvedValue(null);
  mockPrisma.billingEmailLog.create.mockResolvedValue({ id: "log-1", status: "PENDING" });
  mockPrisma.billingEmailLog.update.mockResolvedValue(undefined);
  mockSendWgcEmail.mockResolvedValue({ success: true, data: { id: "email-1" } });
});

describe("sendIdempotentBillingEmail", () => {
  it("sends and logs SENT for a fresh idempotencyKey", async () => {
    const { sendIdempotentBillingEmail } = await load();
    const result = await sendIdempotentBillingEmail(baseInput());

    expect(mockSendWgcEmail).toHaveBeenCalledTimes(1);
    expect(mockPrisma.billingEmailLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "log-1" }, data: expect.objectContaining({ status: "SENT" }) })
    );
    expect(result).toEqual({ sent: true });
  });

  it("skips sending when a log already shows SENT for this idempotencyKey", async () => {
    mockPrisma.billingEmailLog.findUnique.mockResolvedValue({ id: "log-1", status: "SENT" });
    const { sendIdempotentBillingEmail } = await load();
    const result = await sendIdempotentBillingEmail(baseInput());

    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, reason: "already_sent" });
  });

  it("does not throw and does not send a second email when a concurrent caller already claimed this idempotencyKey — the exact race class confirmed in production for dashboard-access emails: two Finix events for the same merchant landing milliseconds apart both reaching the create() call before either had committed", async () => {
    const { Prisma } = require("@prisma/client");
    mockPrisma.billingEmailLog.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" })
    );
    mockPrisma.billingEmailLog.findUnique
      .mockResolvedValueOnce(null) // initial check — nothing sent yet
      .mockResolvedValueOnce({ id: "log-winner", status: "PENDING" }); // re-read after losing the race

    const { sendIdempotentBillingEmail } = await load();
    const result = await sendIdempotentBillingEmail(baseInput());

    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, reason: "send_in_progress_elsewhere" });
  });

  it("reports already_sent when the race is lost against a caller whose send already completed", async () => {
    const { Prisma } = require("@prisma/client");
    mockPrisma.billingEmailLog.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" })
    );
    mockPrisma.billingEmailLog.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "log-winner", status: "SENT" });

    const { sendIdempotentBillingEmail } = await load();
    const result = await sendIdempotentBillingEmail(baseInput());

    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, reason: "already_sent" });
  });

  it("re-throws a non-constraint error from create() instead of swallowing it", async () => {
    mockPrisma.billingEmailLog.create.mockRejectedValue(new Error("connection reset"));
    const { sendIdempotentBillingEmail } = await load();

    await expect(sendIdempotentBillingEmail(baseInput())).rejects.toThrow("connection reset");
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });
});
