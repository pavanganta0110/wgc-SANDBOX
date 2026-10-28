import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, renderPaymentMock, renderExternalMock, authMock } = vi.hoisted(() => ({
  prismaMock: {
    donor: { findFirst: vi.fn() },
    finixPaymentInstrumentSnapshot: { findMany: vi.fn() },
    payment: { findFirst: vi.fn() },
    externalDonation: { findFirst: vi.fn() },
  },
  renderPaymentMock: vi.fn(),
  renderExternalMock: vi.fn(),
  authMock: { requireDonorSession: vi.fn(), findPortalDonorsByEmail: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/giving/generateReceipt", () => ({ renderDonationReceiptPdfForPayment: renderPaymentMock }));
vi.mock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({ renderExternalDonationReceiptPdf: renderExternalMock }));
vi.mock("@/lib/donorPortal/donorAuth", () => {
  class DonorAuthError extends Error {}
  return { DonorAuthError, requireDonorSession: authMock.requireDonorSession, findPortalDonorsByEmail: authMock.findPortalDonorsByEmail };
});

import { DonorAuthError } from "@/lib/donorPortal/donorAuth";
import { GET } from "@/app/api/donor-portal/receipts/[kind]/[id]/route";

const call = (kind: string, id: string) => GET(new Request(`http://x/api/donor-portal/receipts/${kind}/${id}?slug=liberty`), { params: Promise.resolve({ kind, id }) });

beforeEach(() => {
  vi.clearAllMocks();
  authMock.requireDonorSession.mockResolvedValue({ churchId: "church1", donorId: "d1" });
  authMock.findPortalDonorsByEmail.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
  prismaMock.donor.findFirst.mockResolvedValue({ email: "ann@example.com" });
  prismaMock.finixPaymentInstrumentSnapshot.findMany.mockResolvedValue([{ finixPaymentInstrumentId: "PI1" }]);
  renderPaymentMock.mockResolvedValue({ pdf: Buffer.from("%PDF-1.4"), fileName: "receipt-R-1.pdf" });
  renderExternalMock.mockResolvedValue({ pdf: Buffer.from("%PDF-1.4"), fileName: "receipt-E-1.pdf" });
});

describe("donor receipt download", () => {
  it("requires a signed-in donor", async () => {
    authMock.requireDonorSession.mockRejectedValue(new DonorAuthError("no"));
    expect((await call("payment", "p1")).status).toBe(401);
    expect(renderPaymentMock).not.toHaveBeenCalled();
  });

  it("only looks up payments in this church that belong to the donor's own records or cards, and only completed ones", async () => {
    prismaMock.payment.findFirst.mockResolvedValue({ id: "p1" });
    const res = await call("payment", "p1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("receipt-R-1.pdf");
    expect(prismaMock.payment.findFirst.mock.calls[0][0].where).toEqual({
      id: "p1",
      churchId: "church1",
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] },
      OR: [{ donorId: { in: ["d1", "d2"] } }, { finixPaymentInstrumentId: { in: ["PI1"] } }],
    });
    expect(renderPaymentMock).toHaveBeenCalledWith("p1", "church1");
  });

  it("returns 404 — not 403 — for someone else's payment, and never renders it", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);
    expect((await call("payment", "other")).status).toBe(404);
    expect(renderPaymentMock).not.toHaveBeenCalled();
  });

  it("serves church-recorded gifts only when they are the donor's, not voided, not anonymous and not returned", async () => {
    prismaMock.externalDonation.findFirst.mockResolvedValue({ id: "e1", depositStatus: null });
    expect((await call("external", "e1")).status).toBe(200);
    expect(prismaMock.externalDonation.findFirst.mock.calls[0][0].where).toEqual({ id: "e1", churchId: "church1", donorId: { in: ["d1", "d2"] }, status: { not: "VOIDED" }, isAnonymous: false });

    prismaMock.externalDonation.findFirst.mockResolvedValue({ id: "e2", depositStatus: "RETURNED" });
    expect((await call("external", "e2")).status).toBe(404);
    prismaMock.externalDonation.findFirst.mockResolvedValue(null);
    expect((await call("external", "e3")).status).toBe(404);
  });

  it("rejects unknown kinds and sessions with no donor records", async () => {
    expect((await call("invoice", "x")).status).toBe(404);
    authMock.findPortalDonorsByEmail.mockResolvedValue([]);
    expect((await call("payment", "p1")).status).toBe(404);
    expect(prismaMock.payment.findFirst).not.toHaveBeenCalled();
  });

  it("reports a render failure without leaking details", async () => {
    prismaMock.payment.findFirst.mockResolvedValue({ id: "p1" });
    renderPaymentMock.mockRejectedValue(new Error("secret internal detail"));
    const res = await call("payment", "p1");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
