import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const prismaMock = vi.hoisted(() => ({ partner: { updateMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const requirePartnerAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/requirePartnerAdmin", () => ({ requirePartnerAdmin }));

import { PATCH } from "../[partnerId]/route";

const patch = (body: unknown) => PATCH(new Request("https://wgc.test/api/admin/partners/p1", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ partnerId: "p1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  requirePartnerAdmin.mockResolvedValue({ session: { email: "admin@wgc.test" } });
  prismaMock.partner.updateMany.mockResolvedValue({ count: 1 });
});

describe("PATCH /api/admin/partners/[partnerId]", () => {
  it("is for super admins only", async () => {
    requirePartnerAdmin.mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await patch({ pricePerMerchantCents: 2500 })).status).toBe(403);
    expect(prismaMock.partner.updateMany).not.toHaveBeenCalled();
  });

  it("sets the price in whole cents", async () => {
    expect((await patch({ pricePerMerchantCents: 2500 })).status).toBe(200);
    expect(prismaMock.partner.updateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { pricePerMerchantCents: 2500 } });
  });

  it("stops billing with an empty price or zero", async () => {
    await patch({ pricePerMerchantCents: null });
    await patch({ pricePerMerchantCents: 0 });
    expect(prismaMock.partner.updateMany.mock.calls.map((c) => c[0].data.pricePerMerchantCents)).toEqual([null, null]);
  });

  it("rejects fractions, negatives, text and absurd amounts", async () => {
    for (const price of [25.5, -1, "25", 10_000_000]) {
      expect((await patch({ pricePerMerchantCents: price })).status, String(price)).toBe(400);
    }
    expect(prismaMock.partner.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an empty change and still handles the email switch", async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ suppressMerchantEmails: "yes" })).status).toBe(400);
    expect((await patch({ suppressMerchantEmails: true })).status).toBe(200);
    expect(prismaMock.partner.updateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { suppressMerchantEmails: true } });
  });

  it("404s for an unknown partner", async () => {
    prismaMock.partner.updateMany.mockResolvedValue({ count: 0 });
    expect((await patch({ pricePerMerchantCents: 100 })).status).toBe(404);
  });
});
