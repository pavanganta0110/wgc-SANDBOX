import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const admin = vi.hoisted(() => ({ requirePartnerAdmin: vi.fn() }));
const prismaMock = vi.hoisted(() => ({ partner: { findUnique: vi.fn() } }));
const sessionMock = vi.hoisted(() => ({ setPartnerViewAsCookie: vi.fn() }));
const auditMock = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("@/lib/partners/requirePartnerAdmin", () => admin);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/partners/partnerSession", () => sessionMock);
vi.mock("@/lib/audit", () => auditMock);

import { POST } from "../route";

const call = () => POST(new Request("https://wgc.test/x", { method: "POST" }), { params: Promise.resolve({ partnerId: "p1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  admin.requirePartnerAdmin.mockResolvedValue({ session: { userId: "a1", email: "boss@wgc.test" } });
  prismaMock.partner.findUnique.mockResolvedValue({ id: "p1", name: "Clear Vision" });
});

describe("POST /api/admin/partners/[partnerId]/view", () => {
  it("is for super admins only and sets nothing otherwise", async () => {
    admin.requirePartnerAdmin.mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await call()).status).toBe(403);
    expect(sessionMock.setPartnerViewAsCookie).not.toHaveBeenCalled();
  });

  it("404 for an unknown partner", async () => {
    prismaMock.partner.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(sessionMock.setPartnerViewAsCookie).not.toHaveBeenCalled();
  });

  it("opens the read-only view for the signed-in admin and records it", async () => {
    expect((await call()).status).toBe(200);
    expect(sessionMock.setPartnerViewAsCookie).toHaveBeenCalledWith("p1", "a1");
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "PARTNER_DASHBOARD_VIEWED_BY_ADMIN", actorEmail: "boss@wgc.test" }));
  });
});
