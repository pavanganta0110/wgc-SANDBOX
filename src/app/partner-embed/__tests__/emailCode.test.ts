import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const prismaMock = vi.hoisted(() => ({
  church: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
  partner: { findUnique: vi.fn() },
  partnerEmbedEntry: { create: vi.fn(), deleteMany: vi.fn() },
  partnerEmbedEmailCode: { findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));
const sendWgcEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendWgcEmail }));

import { POST as send } from "../email-code/send/route";
import { POST as verify } from "../email-code/verify/route";
import { createPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { hashMfaCode } from "@/lib/auth/mfaCode";
import { verifySessionToken } from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = "x".repeat(40);
});

const maya = { id: "u2", email: "maya@c.test", role: "fundraiser", churchId: "c1", authVersion: 4, disabledAt: null };
const link = () => createPartnerEmbedLinkToken({ partnerId: "p1", reference: "loc_1", email: null, prefill: {} }).token;
const post = (handler: typeof send, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  handler(new Request("https://wgc.test/x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.partner.findUnique.mockResolvedValue({ embedSignInMode: "EMAIL_CODE" });
  prismaMock.church.findFirst.mockResolvedValue({ id: "c1" });
  prismaMock.user.findFirst.mockResolvedValue(maya);
  prismaMock.partnerEmbedEntry.create.mockResolvedValue({});
  prismaMock.partnerEmbedEntry.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.partnerEmbedEmailCode.findFirst.mockResolvedValue(null);
  prismaMock.partnerEmbedEmailCode.count.mockResolvedValue(0);
  prismaMock.partnerEmbedEmailCode.updateMany.mockResolvedValue({ count: 1 });
  sendWgcEmail.mockResolvedValue({ success: true });
});

describe("the code email names the partner", () => {
  it("puts the partner's name in the subject and the body, so the organization's people recognize it", async () => {
    prismaMock.partner.findUnique.mockImplementation(async (args: { select: Record<string, boolean> }) => (args.select.name ? { name: "CV Campus OS" } : { embedSignInMode: "EMAIL_CODE" }));
    await post(send, { link: link(), email: "maya@c.test" });
    const mail = sendWgcEmail.mock.calls[0][0];
    expect(mail.subject).toBe("Your CV Campus OS sign-in code (WGC Payments)");
    expect(mail.bodyHtml).toContain("<strong>CV Campus OS</strong>");
    expect(mail.bodyHtml).toContain("the payments service inside CV Campus OS");
    expect(/strong[^>]*>(\d{6})</.test(mail.bodyHtml)).toBe(true);
  });

  it("escapes the name, and falls back to the plain wording when it can't be read", async () => {
    prismaMock.partner.findUnique.mockImplementation(async (args: { select: Record<string, boolean> }) => (args.select.name ? { name: "A<b>&Co" } : { embedSignInMode: "EMAIL_CODE" }));
    await post(send, { link: link(), email: "maya@c.test" });
    expect(sendWgcEmail.mock.calls[0][0].bodyHtml).toContain("A&lt;b&gt;&amp;Co");
    expect(sendWgcEmail.mock.calls[0][0].bodyHtml).not.toContain("<b>");

    sendWgcEmail.mockClear();
    prismaMock.partner.findUnique.mockImplementation(async (args: { select: Record<string, boolean> }) => {
      if (args.select.name) throw new Error("db");
      return { embedSignInMode: "EMAIL_CODE" };
    });
    await post(send, { link: link(), email: "maya@c.test" });
    expect(sendWgcEmail.mock.calls[0][0].subject).toBe("Your WGC Payments code");
  });
});

describe("emailing the code", () => {
  it("emails a 6-digit code to a person on the team and stores only its hash", async () => {
    const res = await post(send, { link: link(), email: "Maya@C.test" });
    expect(res.status).toBe(200);
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ churchId: "c1", email: "maya@c.test" });
    expect(sendWgcEmail.mock.calls[0][0].to).toBe("maya@c.test");
    const code = /strong[^>]*>(\d{6})</.exec(sendWgcEmail.mock.calls[0][0].bodyHtml)![1];
    const stored = prismaMock.partnerEmbedEmailCode.create.mock.calls[0][0].data;
    expect(stored.codeHash).toBe(hashMfaCode(code));
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it("shows an error and sends nothing for an email that is not on the team", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await post(send, { link: link(), email: "nobody@c.test" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("Ask your administrator to add you under Team");
    expect(sendWgcEmail).not.toHaveBeenCalled();
    expect(prismaMock.partnerEmbedEmailCode.create).not.toHaveBeenCalled();
  });

  it("treats a disabled person and an unknown organization as not on the team", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ ...maya, disabledAt: new Date() });
    expect((await post(send, { link: link(), email: "maya@c.test" })).status).toBe(404);
    prismaMock.church.findFirst.mockResolvedValue(null);
    expect((await post(send, { link: link(), email: "maya@c.test" })).status).toBe(404);
    expect(sendWgcEmail).not.toHaveBeenCalled();
  });

  it("only works for a partner in EMAIL_CODE mode, and refuses a forged link or cross-site request", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ embedSignInMode: "PASSCODE" });
    expect((await post(send, { link: link(), email: "maya@c.test" })).status).toBe(404);
    expect((await post(send, { link: "junk", email: "maya@c.test" })).status).toBe(400);
    expect((await post(send, { link: link(), email: "maya@c.test" }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(sendWgcEmail).not.toHaveBeenCalled();
  });

  it("enforces the resend cooldown and the hourly cap", async () => {
    prismaMock.partnerEmbedEmailCode.findFirst.mockResolvedValue({ createdAt: new Date() });
    expect((await post(send, { link: link(), email: "maya@c.test" })).status).toBe(429);
    prismaMock.partnerEmbedEmailCode.findFirst.mockResolvedValue(null);
    prismaMock.partnerEmbedEmailCode.count.mockResolvedValue(5);
    expect((await post(send, { link: link(), email: "maya@c.test" })).status).toBe(429);
    expect(sendWgcEmail).not.toHaveBeenCalled();
  });

  it("reports a failed email", async () => {
    sendWgcEmail.mockResolvedValue({ success: false });
    expect((await post(send, { link: link(), email: "maya@c.test" })).status).toBe(502);
  });
});

describe("verifying the code", () => {
  const row = { id: "r1", codeHash: hashMfaCode("123456") };

  it("signs the person in as themselves with their own role, and spends the link", async () => {
    prismaMock.partnerEmbedEmailCode.findFirst.mockResolvedValue(row);
    const res = await post(verify, { link: link(), email: "maya@c.test", code: "123 456" });
    expect(res.status).toBe(200);
    expect(prismaMock.partnerEmbedEntry.create).toHaveBeenCalledTimes(1);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("SameSite=None");
    expect(verifySessionToken(/=([^;]+)/.exec(cookie)![1])).toMatchObject({ userId: "u2", role: "fundraiser", churchId: "c1", embedded: true });
  });

  it("refuses a wrong code with no session, and counts the guess", async () => {
    prismaMock.partnerEmbedEmailCode.findFirst.mockResolvedValue(row);
    const res = await post(verify, { link: link(), email: "maya@c.test", code: "000000" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(prismaMock.partnerEmbedEmailCode.updateMany.mock.calls[0][0].data).toEqual({ attempts: { increment: 1 } });
    expect(prismaMock.partnerEmbedEntry.create).not.toHaveBeenCalled();
  });

  it("refuses when attempts are used up, there is no live code, the code is malformed or the email is not on the team", async () => {
    prismaMock.partnerEmbedEmailCode.findFirst.mockResolvedValue(row);
    prismaMock.partnerEmbedEmailCode.updateMany.mockResolvedValue({ count: 0 });
    expect((await post(verify, { link: link(), email: "maya@c.test", code: "123456" })).status).toBe(401);
    prismaMock.partnerEmbedEmailCode.findFirst.mockResolvedValue(null);
    expect((await post(verify, { link: link(), email: "maya@c.test", code: "123456" })).status).toBe(401);
    expect((await post(verify, { link: link(), email: "maya@c.test", code: "12" })).status).toBe(401);
    prismaMock.user.findFirst.mockResolvedValue(null);
    expect((await post(verify, { link: link(), email: "x@c.test", code: "123456" })).status).toBe(401);
  });

  it("refuses a page that was already used", async () => {
    prismaMock.partnerEmbedEmailCode.findFirst.mockResolvedValue(row);
    prismaMock.partnerEmbedEntry.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await post(verify, { link: link(), email: "maya@c.test", code: "123456" });
    expect(res.status).toBe(409);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
