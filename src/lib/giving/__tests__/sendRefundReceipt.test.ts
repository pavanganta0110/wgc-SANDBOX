import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendWgcEmail, prisma } = vi.hoisted(() => ({
  sendWgcEmail: vi.fn(),
  prisma: {
    finixRefundOrReversal: { findFirst: vi.fn() },
    church: { findUnique: vi.fn() },
    finixTransfer: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn() },
    finixPaymentInstrumentSnapshot: { findUnique: vi.fn() },
    donor: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/email", () => ({ sendWgcEmail }));
vi.mock("@/lib/prisma", () => ({ prisma }));

import { sendRefundReceipt } from "../sendRefundReceipt";

function setup(over: { state?: string; donorEmail?: string | null } = {}) {
  prisma.finixRefundOrReversal.findFirst.mockResolvedValue({
    finixReversalId: "TRrefund12345678",
    finixOriginalTransferId: "TRorig",
    state: over.state ?? "SUCCEEDED",
    amountCents: 3623,
    createdAtFinix: new Date("2026-11-20T18:00:00Z"),
  });
  prisma.church.findUnique.mockResolvedValue({ name: "Care Package Inbound, inc", statementSenderName: null, logoUrl: null });
  prisma.finixTransfer.findUnique.mockResolvedValue({ amountCents: 3623, finixPaymentInstrumentId: "PI1" });
  prisma.payment.findFirst.mockResolvedValue({ donorId: "d1" });
  prisma.finixPaymentInstrumentSnapshot.findUnique.mockResolvedValue({ cardBrand: "VISA", cardLast4: "2699", accountHolderName: "Karen Hagans" });
  prisma.donor.findUnique.mockResolvedValue({ name: "Karen Hagans", email: over.donorEmail === undefined ? "karen@example.com" : over.donorEmail });
  sendWgcEmail.mockResolvedValue({ success: true });
}

beforeEach(() => vi.clearAllMocks());

describe("sendRefundReceipt", () => {
  it("emails the donor the refund amount and logs it for the organization", async () => {
    setup();
    const r = await sendRefundReceipt("TRrefund12345678", "church-1", "user-1");
    expect(r.sentTo).toBe("karen@example.com");
    const arg = sendWgcEmail.mock.calls[0][0];
    expect(arg.to).toBe("karen@example.com");
    expect(arg.bodyHtml).toContain("$36.23");
    expect(arg.bodyHtml).toContain("VISA ending in 2699");
    expect(arg.log).toMatchObject({ churchId: "church-1", relatedEntityType: "Refund", createdByUserId: "user-1" });
  });

  it("says the refund is being processed while it is still pending", async () => {
    setup({ state: "PENDING" });
    await sendRefundReceipt("TRrefund12345678", "church-1");
    expect(sendWgcEmail.mock.calls[0][0].bodyHtml).toContain("is being processed");
  });

  it("refuses a failed refund", async () => {
    setup({ state: "FAILED" });
    await expect(sendRefundReceipt("TRrefund12345678", "church-1")).rejects.toThrow(/did not go through/);
    expect(sendWgcEmail).not.toHaveBeenCalled();
  });

  it("needs a typed address when the donor has no email, and uses it", async () => {
    setup({ donorEmail: null });
    await expect(sendRefundReceipt("TRrefund12345678", "church-1")).rejects.toThrow(/no email/);
    const r = await sendRefundReceipt("TRrefund12345678", "church-1", null, ["typed@example.com"]);
    expect(r.sentTo).toBe("typed@example.com");
  });

  it("looks the refund up by organization, never trusting the id alone", async () => {
    setup();
    await sendRefundReceipt("TRrefund12345678", "church-1");
    expect(prisma.finixRefundOrReversal.findFirst).toHaveBeenCalledWith({ where: { finixReversalId: "TRrefund12345678", churchId: "church-1" } });
  });
});
