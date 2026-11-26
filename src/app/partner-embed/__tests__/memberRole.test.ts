import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const prismaMock = vi.hoisted(() => ({
  church: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
  partner: { findUnique: vi.fn() },
  partnerEmbedEntry: { create: vi.fn(), deleteMany: vi.fn() },
  onboardingApplication: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));

import { GET as enterGET } from "../enter/route";
import { GET as updateGET } from "../update/route";
import { createPartnerEmbedLinkToken, verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { limitEmbeddedMenuForRole, EMBEDDED_MENU_CATALOG } from "@/lib/partners/embeddedMenu";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const linkFor = (extra: Record<string, unknown>) => createPartnerEmbedLinkToken({ partnerId: "p1", reference: "loc_1", email: null, prefill: {}, ...extra } as never).token;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.church.findFirst.mockResolvedValue({ id: "c1" });
  prismaMock.user.findFirst.mockResolvedValue({ id: "u1", email: "m@c.test", role: "fundraiser", churchId: "c1", authVersion: 1, disabledAt: null, mfaEnabled: false });
  prismaMock.partner.findUnique.mockResolvedValue({ embedSignInMode: "CRM_IDENTITY" });
  prismaMock.partnerEmbedEntry.create.mockResolvedValue({});
  prismaMock.partnerEmbedEntry.deleteMany.mockResolvedValue({ count: 0 });
});

describe("the viewer role in a signed link", () => {
  it("is an administrator when not given, so links made before this existed behave as always", () => {
    expect(verifyPartnerEmbedLinkToken(linkFor({}))?.role).toBe("admin");
    expect(verifyPartnerEmbedLinkToken(linkFor({ role: "member" }))?.role).toBe("member");
    expect(verifyPartnerEmbedLinkToken(linkFor({ role: "owner" }))?.role).toBe("admin");
  });
});

describe("a member opening the dashboard", () => {
  it("is never signed in as the owner when no email was sent", async () => {
    const res = await enterGET(new Request(`https://wgc.test/partner-embed/enter?link=${linkFor({ role: "member" })}`));
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("problem=1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("is signed in as themselves when the partner names them", async () => {
    const res = await enterGET(new Request(`https://wgc.test/partner-embed/enter?link=${linkFor({ role: "member", email: "m@c.test" })}`));
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toEqual({ churchId: "c1", email: "m@c.test", role: { in: ["owner", "admin", "fundraiser", "viewer"] } });
    expect(res.headers.get("location")).toContain("/merchant/dashboard");
  });

  it("an administrator with no email still falls back to the owner, as before", async () => {
    await enterGET(new Request(`https://wgc.test/partner-embed/enter?link=${linkFor({})}`));
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toEqual({ churchId: "c1", role: "owner" });
  });
});

describe("adding information is for the administrator", () => {
  it("a member gets no upload link", async () => {
    const res = await updateGET(new Request(`https://wgc.test/partner-embed/update?link=${linkFor({ role: "member" })}`));
    expect(prismaMock.onboardingApplication.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.onboardingApplication.update).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/partner-embed?link=");
  });
});

describe("the Giving Hub menu for a fundraiser or viewer", () => {
  const givingHrefs = EMBEDDED_MENU_CATALOG.filter((i) => i.section === "Giving").map((i) => i.href);

  it("keeps only Giving items (plus Home and Support), even when the partner's menu allows more", () => {
    const out = limitEmbeddedMenuForRole(["/merchant/dashboard", "/merchant/support", "/merchant/transactions", "/merchant/settings/team", "/merchant/donors", "/merchant/events"], "fundraiser");
    expect(out).toEqual(["/merchant/dashboard", "/merchant/support", "/merchant/donors", "/merchant/events"]);
  });

  it("shows every Giving item when the partner saved no menu", () => {
    const out = limitEmbeddedMenuForRole(null, "viewer")!;
    expect(givingHrefs.every((h) => out.includes(h))).toBe(true);
    expect(out).not.toContain("/merchant/transactions");
  });

  it("leaves owners and admins on the partner's menu exactly as saved", () => {
    expect(limitEmbeddedMenuForRole(null, "owner")).toBeNull();
    expect(limitEmbeddedMenuForRole(["/merchant/transactions"], "admin")).toEqual(["/merchant/transactions"]);
  });
});

describe("an embedded sign-in is recorded", () => {
  it("sets the person's last sign-in, so they are not listed as a pending invitation", async () => {
    const update = vi.fn().mockResolvedValue({});
    (prismaMock.user as unknown as { update: typeof update }).update = update;
    await enterGET(new Request(`https://wgc.test/partner-embed/enter?link=${linkFor({ role: "member", email: "m@c.test" })}`));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].where).toEqual({ id: "u1" });
    expect(update.mock.calls[0][0].data.lastLoginAt).toBeInstanceOf(Date);
  });
});
