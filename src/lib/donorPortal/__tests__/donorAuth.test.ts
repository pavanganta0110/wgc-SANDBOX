import { describe, it, expect, vi, beforeEach } from "vitest";

const { cookieSet, prismaMock } = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  prismaMock: {
    donor: { findMany: vi.fn() },
    donorLoginCode: {
      count: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    donorPortalSession: { create: vi.fn() },
  },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSet, get: vi.fn(), delete: vi.fn() })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { issueDonorLoginCode, verifyDonorLoginCode, consumeDonorLoginLink } from "../donorAuth";

const donor = { id: "d1", name: "Ann", email: "Ann@Example.com", normalizedEmail: "ann@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.donor.findMany.mockResolvedValue([donor]);
  prismaMock.donorLoginCode.count.mockResolvedValue(0);
  prismaMock.donorLoginCode.updateMany.mockResolvedValue({ count: 1 });
});

async function issue() {
  const result = await issueDonorLoginCode("church1", "ann@example.com");
  if (!result.issued) throw new Error("expected issued");
  const stored = prismaMock.donorLoginCode.create.mock.calls[0][0].data;
  return { result, stored };
}

describe("issueDonorLoginCode", () => {
  it("scopes the donor lookup to the church and active records", async () => {
    await issue();
    expect(prismaMock.donor.findMany.mock.calls[0][0].where).toMatchObject({
      churchId: "church1",
      normalizedEmail: "ann@example.com",
      archivedAt: null,
      mergedIntoDonorId: null,
    });
  });

  it("issues nothing when no donor matches", async () => {
    prismaMock.donor.findMany.mockResolvedValue([]);
    expect(await issueDonorLoginCode("church1", "nobody@example.com")).toEqual({ issued: false });
    expect(prismaMock.donorLoginCode.create).not.toHaveBeenCalled();
  });

  it("throttles when too many codes were issued recently", async () => {
    prismaMock.donorLoginCode.count.mockResolvedValue(3);
    expect(await issueDonorLoginCode("church1", "ann@example.com")).toEqual({ issued: false });
    expect(prismaMock.donorLoginCode.create).not.toHaveBeenCalled();
  });

  it("stores only hashes, never the plain code or link token", async () => {
    const { result, stored } = await issue();
    expect(result.code).toMatch(/^\d{6}$/);
    expect(stored.codeHash).not.toBe(result.code);
    expect(stored.linkTokenHash).not.toBe(result.linkToken);
    expect(stored.churchId).toBe("church1");
  });
});

describe("verifyDonorLoginCode", () => {
  it("accepts the right code and starts a church-bound session", async () => {
    const { result, stored } = await issue();
    prismaMock.donorLoginCode.findFirst.mockResolvedValue({ id: "c1", ...stored, failedAttempts: 0 });
    const out = await verifyDonorLoginCode("church1", "liberty", "ann@example.com", result.code);
    expect(out).toEqual({ ok: true });
    expect(prismaMock.donorPortalSession.create.mock.calls[0][0].data).toMatchObject({ churchId: "church1", donorId: "d1" });
    expect(cookieSet).toHaveBeenCalledWith("wgc_donor_liberty", expect.any(String), expect.objectContaining({ httpOnly: true }));
  });

  it("rejects a wrong code and counts the failed attempt", async () => {
    const { result, stored } = await issue();
    prismaMock.donorLoginCode.findFirst.mockResolvedValue({ id: "c1", ...stored, failedAttempts: 0 });
    const wrong = result.code === "000000" ? "111111" : "000000";
    const out = await verifyDonorLoginCode("church1", "liberty", "ann@example.com", wrong);
    expect(out.ok).toBe(false);
    expect(prismaMock.donorLoginCode.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { failedAttempts: { increment: 1 } } });
    expect(prismaMock.donorPortalSession.create).not.toHaveBeenCalled();
  });

  it("locks the code after too many failed attempts, even with the right code", async () => {
    const { result, stored } = await issue();
    prismaMock.donorLoginCode.findFirst.mockResolvedValue({ id: "c1", ...stored, failedAttempts: 5 });
    const out = await verifyDonorLoginCode("church1", "liberty", "ann@example.com", result.code);
    expect(out.ok).toBe(false);
    expect(prismaMock.donorPortalSession.create).not.toHaveBeenCalled();
  });

  it("fails when two requests race to redeem the same code", async () => {
    const { result, stored } = await issue();
    prismaMock.donorLoginCode.findFirst.mockResolvedValue({ id: "c1", ...stored, failedAttempts: 0 });
    prismaMock.donorLoginCode.updateMany.mockResolvedValue({ count: 0 });
    const out = await verifyDonorLoginCode("church1", "liberty", "ann@example.com", result.code);
    expect(out.ok).toBe(false);
    expect(prismaMock.donorPortalSession.create).not.toHaveBeenCalled();
  });

  it("rejects malformed codes without touching the code table", async () => {
    const out = await verifyDonorLoginCode("church1", "liberty", "ann@example.com", "12ab56");
    expect(out.ok).toBe(false);
    expect(prismaMock.donorLoginCode.findFirst).not.toHaveBeenCalled();
  });
});

describe("consumeDonorLoginLink", () => {
  const base = { id: "c1", churchId: "church1", donorId: "d1", consumedAt: null, expiresAt: new Date(Date.now() + 60_000) };

  it("signs in with a valid link for the same church", async () => {
    prismaMock.donorLoginCode.findUnique.mockResolvedValue(base);
    expect(await consumeDonorLoginLink("church1", "liberty", "tok")).toEqual({ ok: true });
  });

  it("refuses a link issued for a different church (cross-tenant)", async () => {
    prismaMock.donorLoginCode.findUnique.mockResolvedValue({ ...base, churchId: "church_OTHER" });
    expect((await consumeDonorLoginLink("church1", "liberty", "tok")).ok).toBe(false);
    expect(prismaMock.donorPortalSession.create).not.toHaveBeenCalled();
  });

  it("refuses an expired or already-used link", async () => {
    prismaMock.donorLoginCode.findUnique.mockResolvedValue({ ...base, expiresAt: new Date(Date.now() - 1000) });
    expect((await consumeDonorLoginLink("church1", "liberty", "tok")).ok).toBe(false);
    prismaMock.donorLoginCode.findUnique.mockResolvedValue({ ...base, consumedAt: new Date() });
    expect((await consumeDonorLoginLink("church1", "liberty", "tok")).ok).toBe(false);
  });
});
