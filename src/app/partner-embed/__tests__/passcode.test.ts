import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const prismaMock = vi.hoisted(() => ({
  church: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
  partner: { findUnique: vi.fn() },
  partnerEmbedEntry: { create: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));
const passcode = vi.hoisted(() => ({ checkFramePasscode: vi.fn(), spendDecoyPasscodeCheck: vi.fn() }));
vi.mock("@/lib/auth/framePasscode", () => passcode);

import { POST } from "../passcode/route";
import { createPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { verifySessionToken } from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const maya = { id: "u2", email: "maya@c.test", role: "fundraiser", churchId: "c1", authVersion: 4, disabledAt: null, mfaEnabled: false };
const link = () => createPartnerEmbedLinkToken({ partnerId: "p1", reference: "loc_1", email: null, prefill: {} }).token;
const post = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  POST(new Request("https://wgc.test/partner-embed/passcode", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.partner.findUnique.mockResolvedValue({ embedSignInMode: "PASSCODE" });
  prismaMock.church.findFirst.mockResolvedValue({ id: "c1" });
  prismaMock.user.findFirst.mockResolvedValue(maya);
  prismaMock.partnerEmbedEntry.create.mockResolvedValue({});
  prismaMock.partnerEmbedEntry.deleteMany.mockResolvedValue({ count: 0 });
  passcode.checkFramePasscode.mockResolvedValue({ ok: true });
});

describe("signing in from the partner's frame with a passcode", () => {
  it("signs the person in as themselves with their own role, for four hours", async () => {
    const res = await post({ link: link(), email: "Maya@C.test", passcode: "river-stone-42" });
    expect(res.status).toBe(200);
    expect(prismaMock.church.findFirst.mock.calls[0][0].where).toEqual({ partnerId: "p1", partnerReference: "loc_1" });
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ churchId: "c1", email: "maya@c.test" });
    expect(passcode.checkFramePasscode).toHaveBeenCalledWith("u2", "river-stone-42");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Max-Age=14400");
    expect(verifySessionToken(/=([^;]+)/.exec(cookie)![1])).toMatchObject({ userId: "u2", role: "fundraiser", churchId: "c1", embedded: true });
  });

  it("a wrong passcode, an unknown email, a disabled person and a person with two-factor all get the same answer and no session", async () => {
    passcode.checkFramePasscode.mockResolvedValue({ ok: false, reason: "invalid" });
    const wrong = await post({ link: link(), email: "maya@c.test", passcode: "wrong-one" });
    prismaMock.user.findFirst.mockResolvedValue(null);
    const unknown = await post({ link: link(), email: "nobody@c.test", passcode: "river-stone-42" });
    prismaMock.user.findFirst.mockResolvedValue({ ...maya, disabledAt: new Date() });
    const disabled = await post({ link: link(), email: "maya@c.test", passcode: "river-stone-42" });
    prismaMock.user.findFirst.mockResolvedValue({ ...maya, mfaEnabled: true });
    const mfa = await post({ link: link(), email: "maya@c.test", passcode: "river-stone-42" });
    const bodies = await Promise.all([wrong, unknown, disabled, mfa].map(async (r) => ({ status: r.status, cookie: r.headers.get("set-cookie"), body: await r.json() })));
    for (const b of bodies) {
      expect(b.status).toBe(401);
      expect(b.cookie).toBeNull();
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b.body))).size).toBe(1);
    expect(passcode.spendDecoyPasscodeCheck).toHaveBeenCalledTimes(3);
    expect(prismaMock.partnerEmbedEntry.create).not.toHaveBeenCalled();
  });

  it("is refused for a partner that does not use passcodes", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ embedSignInMode: "CRM_IDENTITY" });
    const res = await post({ link: link(), email: "maya@c.test", passcode: "river-stone-42" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("spends the link only when the sign-in works, and a second use is refused", async () => {
    const l = link();
    expect((await post({ link: l, email: "maya@c.test", passcode: "river-stone-42" })).status).toBe(200);
    prismaMock.partnerEmbedEntry.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const again = await post({ link: l, email: "maya@c.test", passcode: "river-stone-42" });
    expect(again.status).toBe(409);
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a forged or missing link, and a request from another site", async () => {
    expect((await post({ link: "junk", email: "maya@c.test", passcode: "river-stone-42" })).status).toBe(400);
    expect((await post({ email: "maya@c.test", passcode: "river-stone-42" })).status).toBe(400);
    const cross = await post({ link: link(), email: "maya@c.test", passcode: "river-stone-42" }, { "sec-fetch-site": "cross-site" });
    expect(cross.status).toBe(403);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});
