import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  partnerUser: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth/merchantAuthRateLimit", () => ({ checkMerchantAuthRateLimit: () => true }));
const requirePartnerSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/partnerSession", () => ({ requirePartnerSession }));
const accounts = vi.hoisted(() => ({ createPartnerInvite: vi.fn() }));
vi.mock("@/lib/partners/partnerAccounts", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/partners/partnerAccounts")>()), createPartnerInvite: accounts.createPartnerInvite }));
const sendInvite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/partnerInviteEmail", () => ({ sendPartnerInviteEmail: sendInvite }));

import { GET, POST } from "../route";
import { DELETE } from "../[userId]/route";
import { PartnerAccountError } from "@/lib/partners/partnerAccounts";
import { UnauthorizedError } from "@/lib/auth/errors";

const session = { partnerId: "p1", partnerUserId: "me", email: "me@example.test" };
const post = (body: unknown) => POST(new Request("https://wgc.test/api/partner/team", { method: "POST", body: JSON.stringify(body) }));
const del = (userId: string) => DELETE(new Request("https://wgc.test/x", { method: "DELETE" }), { params: Promise.resolve({ userId }) });

beforeEach(() => {
  vi.clearAllMocks();
  requirePartnerSession.mockResolvedValue(session);
  prismaMock.partner.findUnique.mockResolvedValue({ name: "Clear Vision" });
  accounts.createPartnerInvite.mockResolvedValue({ rawToken: "tok", userId: "u2", expiresAt: new Date() });
  sendInvite.mockResolvedValue(true);
  prismaMock.partnerUser.update.mockResolvedValue({});
});

describe("GET /api/partner/team", () => {
  it("lists only the signed-in partner's people, with a status, and never a password hash", async () => {
    prismaMock.partnerUser.findMany.mockResolvedValue([
      { id: "me", email: "me@example.test", name: "Me", passwordHash: "x:y", disabledAt: null, lastLoginAt: null },
      { id: "u2", email: "new@example.test", name: null, passwordHash: null, disabledAt: null, lastLoginAt: null },
      { id: "u3", email: "gone@example.test", name: null, passwordHash: "x:y", disabledAt: new Date(), lastLoginAt: null },
    ]);
    const body = await (await GET()).json();
    expect(prismaMock.partnerUser.findMany.mock.calls[0][0].where).toEqual({ partnerId: "p1" });
    expect(body.users.map((u: { status: string; isYou: boolean }) => [u.status, u.isYou])).toEqual([["active", true], ["invite_pending", false], ["disabled", false]]);
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("needs a sign-in", async () => {
    requirePartnerSession.mockRejectedValue(new UnauthorizedError());
    expect((await GET()).status).toBe(401);
  });
});

describe("POST /api/partner/team", () => {
  it("invites someone to the signed-in partner's own account", async () => {
    const res = await post({ email: " New@Example.test ", name: "New Person" });
    expect(res.status).toBe(201);
    expect(accounts.createPartnerInvite).toHaveBeenCalledWith({ partnerId: "p1", email: "new@example.test", name: "New Person" });
    expect(sendInvite).toHaveBeenCalledWith({ partnerName: "Clear Vision", email: "new@example.test", rawToken: "tok" });
  });

  it("rejects a bad email, and an email that already has an account", async () => {
    expect((await post({ email: "nope" })).status).toBe(400);
    accounts.createPartnerInvite.mockRejectedValue(new PartnerAccountError("email_in_use", "That email already has a partner account."));
    expect((await post({ email: "taken@example.test" })).status).toBe(409);
  });

  it("says so when the email could not be sent", async () => {
    sendInvite.mockResolvedValue(false);
    expect((await post({ email: "new@example.test" })).status).toBe(502);
  });
});

describe("DELETE /api/partner/team/[userId]", () => {
  it("won't remove yourself", async () => {
    expect((await del("me")).status).toBe(400);
    expect(prismaMock.partnerUser.update).not.toHaveBeenCalled();
  });

  it("only touches people of the signed-in partner", async () => {
    prismaMock.partnerUser.findFirst.mockResolvedValue(null);
    expect((await del("someone-else")).status).toBe(404);
    expect(prismaMock.partnerUser.findFirst.mock.calls[0][0].where).toEqual({ id: "someone-else", partnerId: "p1" });
  });

  it("keeps at least one active person", async () => {
    prismaMock.partnerUser.findFirst.mockResolvedValue({ id: "u2", email: "x@example.test", disabledAt: null });
    prismaMock.partnerUser.count.mockResolvedValue(0);
    expect((await del("u2")).status).toBe(409);
    expect(prismaMock.partnerUser.update).not.toHaveBeenCalled();
  });

  it("signs the person out at once and clears any pending link or code", async () => {
    prismaMock.partnerUser.findFirst.mockResolvedValue({ id: "u2", email: "x@example.test", disabledAt: null });
    prismaMock.partnerUser.count.mockResolvedValue(1);
    expect((await del("u2")).status).toBe(200);
    const data = prismaMock.partnerUser.update.mock.calls[0][0].data;
    expect(data.disabledAt).toBeInstanceOf(Date);
    expect(data.authVersion).toEqual({ increment: 1 });
    expect(data).toMatchObject({ setPasswordTokenHash: null, mfaCodeHash: null, mfaChallengeHash: null });
  });
});
