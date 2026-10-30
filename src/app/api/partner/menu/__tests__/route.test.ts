import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ partner: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));
const sessionFn = vi.hoisted(() => vi.fn(async () => ({ partnerId: "p1", partnerUserId: "u1", email: "d@x.test" })));
vi.mock("@/lib/partners/partnerSession", () => ({ requirePartnerSession: sessionFn, requirePartnerWriteSession: sessionFn }));

import { GET, PUT } from "../route";

const put = (body: unknown) => PUT(new Request("https://wgc.test/api/partner/menu", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("/api/partner/menu", () => {
  it("saves for the signed-in partner only, keeping the always-on items and dropping unknown ones", async () => {
    const res = await put({ allowed: ["/merchant/donors", "/evil"], partnerId: "p2" });
    expect(res.status).toBe(200);
    const call = prismaMock.partner.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "p1" });
    expect(call.data.embeddedMenuJson.allowed.sort()).toEqual(["/merchant/dashboard", "/merchant/donors", "/merchant/support"]);
  });

  it("rejects a body with no list", async () => {
    expect((await put({})).status).toBe(400);
    expect(prismaMock.partner.update).not.toHaveBeenCalled();
  });

  it("reports nothing saved as everything on", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ embeddedMenuJson: null });
    const body = await (await GET()).json();
    expect(body.saved).toBe(false);
    expect(body.allowed.length).toBe(body.items.length);
  });
});
