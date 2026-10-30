import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const admin = vi.hoisted(() => ({ requirePartnerAdmin: vi.fn() }));
const prismaMock = vi.hoisted(() => ({ partner: { updateMany: vi.fn() } }));
vi.mock("@/lib/partners/requirePartnerAdmin", () => admin);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));

import { PATCH } from "../[partnerId]/route";

const patch = (body: unknown) => PATCH(new Request("https://wgc.test/x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ partnerId: "p1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  admin.requirePartnerAdmin.mockResolvedValue({ session: { email: "a@wgc.test" } });
  prismaMock.partner.updateMany.mockResolvedValue({ count: 1 });
});

describe("PATCH /api/admin/partners/[partnerId]: how people sign in", () => {
  it("saves one of the two modes for that partner", async () => {
    expect((await patch({ embedSignInMode: "PASSCODE" })).status).toBe(200);
    expect(prismaMock.partner.updateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { embedSignInMode: "PASSCODE" } });
    expect((await patch({ embedSignInMode: "CRM_IDENTITY" })).status).toBe(200);
  });
  it("refuses anything else, and anyone who is not a super admin", async () => {
    expect((await patch({ embedSignInMode: "NONE" })).status).toBe(400);
    expect((await patch({ embedSignInMode: 5 })).status).toBe(400);
    admin.requirePartnerAdmin.mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await patch({ embedSignInMode: "PASSCODE" })).status).toBe(403);
    expect(prismaMock.partner.updateMany).not.toHaveBeenCalled();
  });
});
