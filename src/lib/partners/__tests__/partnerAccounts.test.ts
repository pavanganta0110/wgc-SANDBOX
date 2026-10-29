import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn() },
  partnerUser: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { acceptPartnerInvite, createPartnerInvite, hashPartnerToken, slugifyPartnerName, verifyPartnerLogin, PartnerAccountError } from "../partnerAccounts";
import { hashPassword } from "@/lib/auth/password";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.partner.findUnique.mockResolvedValue({ id: "p_1" });
  prismaMock.user.findUnique.mockResolvedValue(null);
});

describe("slugifyPartnerName", () => {
  it("makes a short lowercase name", () => {
    expect(slugifyPartnerName("Clear Vision Design & Marketing, LLC")).toBe("clear-vision-design-marketing-llc");
    expect(slugifyPartnerName("  !!  ")).toBe("");
  });
});

describe("createPartnerInvite", () => {
  it("stores only the hash of the link", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(null);
    prismaMock.partnerUser.create.mockResolvedValue({ id: "pu_1" });
    const { rawToken } = await createPartnerInvite({ partnerId: "p_1", email: " David@Example.com " });
    const data = prismaMock.partnerUser.create.mock.calls[0][0].data;
    expect(data.email).toBe("david@example.com");
    expect(data.setPasswordTokenHash).toBe(hashPartnerToken(rawToken));
    expect(JSON.stringify(data)).not.toContain(rawToken);
  });

  it("refuses an email that already set a password", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "pu_1", partnerId: "p_1", passwordHash: "x:y" });
    await expect(createPartnerInvite({ partnerId: "p_1", email: "a@b.co" })).rejects.toMatchObject({ code: "email_in_use" });
  });

  it("refuses an email that belongs to another partner", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "pu_1", partnerId: "p_2", passwordHash: null });
    await expect(createPartnerInvite({ partnerId: "p_1", email: "a@b.co" })).rejects.toMatchObject({ code: "email_in_use" });
  });

  it("refuses an email used by an organization or admin account", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ id: "u_1" });
    await expect(createPartnerInvite({ partnerId: "p_1", email: "a@b.co" })).rejects.toBeInstanceOf(PartnerAccountError);
  });

  it("re-issues the link for someone still pending", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "pu_1", partnerId: "p_1", passwordHash: null });
    prismaMock.partnerUser.update.mockResolvedValue({ id: "pu_1" });
    await createPartnerInvite({ partnerId: "p_1", email: "a@b.co" });
    expect(prismaMock.partnerUser.update).toHaveBeenCalled();
    expect(prismaMock.partnerUser.create).not.toHaveBeenCalled();
  });
});

describe("acceptPartnerInvite", () => {
  const future = new Date(Date.now() + 60_000);

  it("rejects a short password before touching the database", async () => {
    await expect(acceptPartnerInvite("tok", "short")).rejects.toMatchObject({ code: "weak_password" });
    expect(prismaMock.partnerUser.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown or expired link", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(null);
    await expect(acceptPartnerInvite("tok", "a-long-enough-password")).rejects.toMatchObject({ code: "invalid_link" });

    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "pu_1", setPasswordTokenExpiresAt: new Date(Date.now() - 1000), disabledAt: null });
    await expect(acceptPartnerInvite("tok", "a-long-enough-password")).rejects.toMatchObject({ code: "invalid_link" });
  });

  it("rejects a disabled account", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "pu_1", setPasswordTokenExpiresAt: future, disabledAt: new Date() });
    await expect(acceptPartnerInvite("tok", "a-long-enough-password")).rejects.toMatchObject({ code: "disabled" });
  });

  it("is single use: a lost race fails", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "pu_1", setPasswordTokenExpiresAt: future, disabledAt: null });
    prismaMock.partnerUser.updateMany.mockResolvedValue({ count: 0 });
    await expect(acceptPartnerInvite("tok", "a-long-enough-password")).rejects.toMatchObject({ code: "invalid_link" });
  });

  it("sets the password, clears the link and bumps authVersion", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "pu_1", setPasswordTokenExpiresAt: future, disabledAt: null });
    prismaMock.partnerUser.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.partnerUser.findUniqueOrThrow.mockResolvedValue({ id: "pu_1", partnerId: "p_1", email: "a@b.co", authVersion: 2 });
    const user = await acceptPartnerInvite("tok", "a-long-enough-password");
    const call = prismaMock.partnerUser.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "pu_1", setPasswordTokenHash: hashPartnerToken("tok") });
    expect(call.data.setPasswordTokenHash).toBeNull();
    expect(call.data.authVersion).toEqual({ increment: 1 });
    expect(call.data.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(user.authVersion).toBe(2);
  });
});

describe("verifyPartnerLogin", () => {
  it("accepts the right password", async () => {
    const passwordHash = await hashPassword("correct horse battery");
    prismaMock.partnerUser.findUnique.mockResolvedValue({ id: "pu_1", partnerId: "p_1", email: "a@b.co", passwordHash, disabledAt: null, authVersion: 4, partner: { status: "ACTIVE" } });
    await expect(verifyPartnerLogin("A@B.co", "correct horse battery")).resolves.toMatchObject({ id: "pu_1", authVersion: 4 });
  });

  it("returns null for a wrong password, unknown email, pending invite, disabled user or suspended partner", async () => {
    const passwordHash = await hashPassword("correct horse battery");
    const base = { id: "pu_1", partnerId: "p_1", email: "a@b.co", passwordHash, disabledAt: null, authVersion: 1, partner: { status: "ACTIVE" } };

    prismaMock.partnerUser.findUnique.mockResolvedValue(base);
    expect(await verifyPartnerLogin("a@b.co", "wrong password!!")).toBeNull();

    prismaMock.partnerUser.findUnique.mockResolvedValue(null);
    expect(await verifyPartnerLogin("a@b.co", "correct horse battery")).toBeNull();

    prismaMock.partnerUser.findUnique.mockResolvedValue({ ...base, passwordHash: null });
    expect(await verifyPartnerLogin("a@b.co", "correct horse battery")).toBeNull();

    prismaMock.partnerUser.findUnique.mockResolvedValue({ ...base, disabledAt: new Date() });
    expect(await verifyPartnerLogin("a@b.co", "correct horse battery")).toBeNull();

    prismaMock.partnerUser.findUnique.mockResolvedValue({ ...base, partner: { status: "SUSPENDED" } });
    expect(await verifyPartnerLogin("a@b.co", "correct horse battery")).toBeNull();
  });
});
