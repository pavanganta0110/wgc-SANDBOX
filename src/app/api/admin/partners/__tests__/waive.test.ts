import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const prismaMock = vi.hoisted(() => ({ partnerInvoice: { updateMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const requirePartnerAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/requirePartnerAdmin", () => ({ requirePartnerAdmin }));

import { POST } from "../[partnerId]/invoices/[invoiceId]/waive/route";

const post = (body: unknown) => POST(new Request("https://wgc.test/x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ partnerId: "p1", invoiceId: "inv1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  requirePartnerAdmin.mockResolvedValue({ session: { email: "admin@wgc.test" } });
  prismaMock.partnerInvoice.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST waive", () => {
  it("is for super admins only", async () => {
    requirePartnerAdmin.mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await post({ reason: "x" })).status).toBe(403);
    expect(prismaMock.partnerInvoice.updateMany).not.toHaveBeenCalled();
  });

  it("needs a reason", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ reason: "   " })).status).toBe(400);
  });

  it("waives only an unpaid invoice of that partner, never one being charged or already paid", async () => {
    expect((await post({ reason: "Pilot month" })).status).toBe(200);
    const call = prismaMock.partnerInvoice.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "inv1", partnerId: "p1", status: { in: ["PENDING", "AWAITING_CARD", "FAILED"] } });
    expect(call.data).toMatchObject({ status: "WAIVED", nextAttemptAt: null });
  });

  it("answers 409 when the invoice can't be waived", async () => {
    prismaMock.partnerInvoice.updateMany.mockResolvedValue({ count: 0 });
    expect((await post({ reason: "x" })).status).toBe(409);
  });
});
