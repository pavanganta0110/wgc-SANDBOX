import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const prismaMock = vi.hoisted(() => ({ church: { findFirst: vi.fn() }, user: { findFirst: vi.fn() }, partner: { findUnique: vi.fn() }, partnerEmbedEntry: { create: vi.fn(), deleteMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));

import { GET } from "../enter/route";
import { createPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { verifySessionToken } from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const owner = { id: "u1", email: "o@c.test", role: "owner", churchId: "c1", authVersion: 3, disabledAt: null, mfaEnabled: false };
const enter = (email: string | null = null) => {
  const { token } = createPartnerEmbedLinkToken({ partnerId: "p1", reference: "loc_1", email, prefill: {} });
  return GET(new Request(`https://wgc.test/partner-embed/enter?link=${token}`));
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.church.findFirst.mockResolvedValue({ id: "c1" });
  prismaMock.user.findFirst.mockResolvedValue(owner);
  prismaMock.partner.findUnique.mockResolvedValue({ embedSignInMode: "CRM_IDENTITY" });
  prismaMock.partnerEmbedEntry.create.mockResolvedValue({});
  prismaMock.partnerEmbedEntry.deleteMany.mockResolvedValue({ count: 0 });
});

describe("partner embed sign-in", () => {
  it("looks the organization up by partner and reference, and signs the owner in as an embedded admin", async () => {
    const res = await enter();
    expect(prismaMock.church.findFirst.mock.calls[0][0].where).toEqual({ partnerId: "p1", partnerReference: "loc_1" });
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toEqual({ churchId: "c1", role: "owner" });
    expect(res.headers.get("location")).toContain("/merchant/dashboard");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("SameSite=None");
    const session = verifySessionToken(/=([^;]+)/.exec(cookie)![1]);
    expect(session).toMatchObject({ userId: "u1", churchId: "c1", role: "admin", embedded: true });
  });

  it("uses the named person when they are on the team", async () => {
    await enter("a@c.test");
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ churchId: "c1", email: "a@c.test" });
  });

  it("refuses MFA users, disabled users and unknown organizations without a session", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ ...owner, mfaEnabled: true });
    expect((await enter()).headers.get("set-cookie")).toBeNull();
    prismaMock.user.findFirst.mockResolvedValue({ ...owner, disabledAt: new Date() });
    expect((await enter()).headers.get("set-cookie")).toBeNull();
    prismaMock.church.findFirst.mockResolvedValue(null);
    expect((await enter()).headers.get("set-cookie")).toBeNull();
  });

  it("opens a dashboard once: the first use is stored and a second use of the same link is refused", async () => {
    const { token } = createPartnerEmbedLinkToken({ partnerId: "p1", reference: "loc_1", email: null, prefill: {} });
    const url = `https://wgc.test/partner-embed/enter?link=${token}`;

    const first = await GET(new Request(url));
    expect(first.headers.get("set-cookie")).toContain("wgc_session=");
    expect(prismaMock.partnerEmbedEntry.create).toHaveBeenCalledTimes(1);
    const stored = prismaMock.partnerEmbedEntry.create.mock.calls[0][0].data;
    expect(stored.partnerId).toBe("p1");
    expect(stored.jtiHash).toMatch(/^[0-9a-f]{64}$/);

    prismaMock.partnerEmbedEntry.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const second = await GET(new Request(url));
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(second.headers.get("location")).toContain("problem=used");
  });

  it("a refused person does not use up the link", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ ...owner, mfaEnabled: true });
    await enter();
    expect(prismaMock.partnerEmbedEntry.create).not.toHaveBeenCalled();
  });

  it("the session itself, not only its cookie, ends after four hours", async () => {
    const res = await enter();
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Max-Age=14400");
    const session = verifySessionToken(/=([^;]+)/.exec(cookie)![1])!;
    const left = session.exp - Math.floor(Date.now() / 1000);
    expect(left).toBeGreaterThan(14400 - 60);
    expect(left).toBeLessThanOrEqual(14400);
  });

  it("a partner whose people sign in with passcodes never opens a dashboard from a name in the link", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ embedSignInMode: "PASSCODE" });
    const res = await enter("someone@church.test");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.partnerEmbedEntry.create).not.toHaveBeenCalled();
  });

  it("ignores a forged link", async () => {
    const res = await GET(new Request("https://wgc.test/partner-embed/enter?link=junk"));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(prismaMock.church.findFirst).not.toHaveBeenCalled();
  });
});
