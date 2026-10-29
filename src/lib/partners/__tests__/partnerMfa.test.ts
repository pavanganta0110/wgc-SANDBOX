import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const prismaMock = vi.hoisted(() => ({ partnerUser: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendWgcEmail: sendEmail }));

import { isPartnerMfaDisabled, maskEmail, resendPartnerMfa, startPartnerMfa, verifyPartnerMfa } from "../partnerMfa";
import { hashMfaCode } from "@/lib/auth/mfaCode";

const NOW = new Date("2026-11-03T12:00:00Z");
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

const userRow = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  partnerId: "p1",
  email: "david@example.test",
  authVersion: 3,
  disabledAt: null,
  mfaCodeHash: hashMfaCode("123456"),
  mfaCodeExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
  mfaCodeAttempts: 0,
  partner: { status: "ACTIVE" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({ success: true });
  prismaMock.partnerUser.update.mockResolvedValue({});
  prismaMock.partnerUser.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("startPartnerMfa", () => {
  it("stores only hashes and emails the code", async () => {
    const { challengeId, sent } = await startPartnerMfa({ id: "u1", email: "d@example.test" }, NOW);
    expect(sent).toBe(true);
    const data = prismaMock.partnerUser.update.mock.calls[0][0].data;
    expect(data.mfaChallengeHash).toBe(sha(challengeId));
    expect(data.mfaCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.mfaCodeAttempts).toBe(0);
    expect(data.mfaCodeExpiresAt).toEqual(new Date(NOW.getTime() + 10 * 60 * 1000));
    const html: string = sendEmail.mock.calls[0][0].bodyHtml;
    const code = /(\d{6})/.exec(html)![1];
    expect(data.mfaCodeHash).toBe(hashMfaCode(code));
    expect(JSON.stringify(data)).not.toContain(code);
  });

  it("reports when the email could not be sent", async () => {
    sendEmail.mockResolvedValue({ success: false });
    expect((await startPartnerMfa({ id: "u1", email: "d@example.test" }, NOW)).sent).toBe(false);
  });
});

describe("verifyPartnerMfa", () => {
  it("accepts the right code once and returns who signed in", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(userRow());
    const result = await verifyPartnerMfa("challenge", "123456", NOW);
    expect(result).toEqual({ ok: true, user: { id: "u1", partnerId: "p1", email: "david@example.test", authVersion: 3 } });
    expect(prismaMock.partnerUser.findUnique.mock.calls[0][0].where).toEqual({ mfaChallengeHash: sha("challenge") });
    const spend = prismaMock.partnerUser.updateMany.mock.calls[0][0];
    expect(spend.data).toMatchObject({ mfaCodeHash: null, mfaChallengeHash: null, mfaCodeExpiresAt: null });
  });

  it("can't be used twice: a lost race fails", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(userRow());
    prismaMock.partnerUser.updateMany.mockResolvedValue({ count: 0 });
    expect(await verifyPartnerMfa("challenge", "123456", NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("counts a wrong code, and locks after five", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(userRow({ mfaCodeAttempts: 1 }));
    expect(await verifyPartnerMfa("challenge", "000000", NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(prismaMock.partnerUser.updateMany.mock.calls[0][0].data).toEqual({ mfaCodeAttempts: { increment: 1 } });

    prismaMock.partnerUser.findUnique.mockResolvedValue(userRow({ mfaCodeAttempts: 4 }));
    expect(await verifyPartnerMfa("challenge", "000000", NOW)).toEqual({ ok: false, reason: "locked" });

    prismaMock.partnerUser.findUnique.mockResolvedValue(userRow({ mfaCodeAttempts: 5 }));
    expect(await verifyPartnerMfa("challenge", "123456", NOW)).toEqual({ ok: false, reason: "locked" });
  });

  it("rejects an expired code, an unknown challenge, a disabled user and a suspended partner", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(userRow({ mfaCodeExpiresAt: new Date(NOW.getTime() - 1) }));
    expect(await verifyPartnerMfa("c", "123456", NOW)).toEqual({ ok: false, reason: "expired" });

    prismaMock.partnerUser.findUnique.mockResolvedValue(null);
    expect(await verifyPartnerMfa("c", "123456", NOW)).toEqual({ ok: false, reason: "invalid" });

    prismaMock.partnerUser.findUnique.mockResolvedValue(userRow({ disabledAt: new Date() }));
    expect(await verifyPartnerMfa("c", "123456", NOW)).toEqual({ ok: false, reason: "invalid" });

    prismaMock.partnerUser.findUnique.mockResolvedValue(userRow({ partner: { status: "SUSPENDED" } }));
    expect(await verifyPartnerMfa("c", "123456", NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects malformed input before touching the database", async () => {
    for (const code of ["", "12345", "1234567", "abcdef", "12 456"]) expect(await verifyPartnerMfa("c", code, NOW), code).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyPartnerMfa("", "123456", NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(prismaMock.partnerUser.findUnique).not.toHaveBeenCalled();
  });
});

describe("resendPartnerMfa", () => {
  const open = (over: Record<string, unknown> = {}) => ({ id: "u1", email: "d@example.test", disabledAt: null, mfaCodeSentAt: new Date(NOW.getTime() - 60_000), mfaCodeExpiresAt: new Date(NOW.getTime() + 60_000), ...over });

  it("sends a new code for an open sign-in", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(open());
    expect(await resendPartnerMfa("challenge", NOW)).toEqual({ ok: true });
    expect(prismaMock.partnerUser.update.mock.calls[0][0].data).toMatchObject({ mfaCodeAttempts: 0 });
  });

  it("makes people wait between codes", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(open({ mfaCodeSentAt: new Date(NOW.getTime() - 5_000) }));
    expect(await resendPartnerMfa("challenge", NOW)).toEqual({ ok: false, reason: "too_soon" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses an unknown sign-in", async () => {
    prismaMock.partnerUser.findUnique.mockResolvedValue(null);
    expect(await resendPartnerMfa("challenge", NOW)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("helpers", () => {
  it("masks an email", () => {
    expect(maskEmail("david@example.test")).toBe("d••••@example.test");
    expect(maskEmail("a@example.test")).toBe("a•@example.test");
    expect(maskEmail("not-an-email")).toBe("your email");
  });

  it("the development switch is ignored in production", () => {
    vi.stubEnv("PARTNER_MFA_DISABLED", "1");
    expect(isPartnerMfaDisabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isPartnerMfaDisabled()).toBe(false);
  });
});
