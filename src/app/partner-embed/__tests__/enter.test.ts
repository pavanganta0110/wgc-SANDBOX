import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const prismaMock = vi.hoisted(() => ({ church: { findFirst: vi.fn() }, user: { findFirst: vi.fn() } }));
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

  it("ignores a forged link", async () => {
    const res = await GET(new Request("https://wgc.test/partner-embed/enter?link=junk"));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(prismaMock.church.findFirst).not.toHaveBeenCalled();
  });
});
