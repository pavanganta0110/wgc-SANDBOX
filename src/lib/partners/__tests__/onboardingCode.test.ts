import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ partner: { findUnique: vi.fn(), updateMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ensureOnboardingCode, generateOnboardingCode, looksLikeOnboardingCode, partnerSuppressesMerchantEmails, resolvePartnerByOnboardingCode } from "../onboardingCode";

beforeEach(() => vi.clearAllMocks());

describe("onboarding code", () => {
  it("generates codes that pass the shape check and differ each time", () => {
    const a = generateOnboardingCode();
    expect(looksLikeOnboardingCode(a)).toBe(true);
    expect(generateOnboardingCode()).not.toBe(a);
  });

  it("rejects anything that isn't shaped like a code", () => {
    for (const bad of [undefined, null, 42, "", "ob_", "ob_short", "xx_" + "a".repeat(24), "ob_" + "a".repeat(80), "ob_has space aaaaaaaaaaaaaaaaaaaa"]) {
      expect(looksLikeOnboardingCode(bad), String(bad)).toBe(false);
    }
  });

  it("looks a partner up only for a well-formed code, and only if it is ACTIVE", async () => {
    const code = generateOnboardingCode();
    expect(await resolvePartnerByOnboardingCode("nope")).toBeNull();
    expect(prismaMock.partner.findUnique).not.toHaveBeenCalled();

    prismaMock.partner.findUnique.mockResolvedValue({ id: "p1", status: "SUSPENDED", suppressMerchantEmails: false });
    expect(await resolvePartnerByOnboardingCode(code)).toBeNull();

    prismaMock.partner.findUnique.mockResolvedValue({ id: "p1", status: "ACTIVE", suppressMerchantEmails: true });
    expect(await resolvePartnerByOnboardingCode(code)).toEqual({ id: "p1", suppressMerchantEmails: true });
    expect(prismaMock.partner.findUnique.mock.calls.at(-1)![0].where).toEqual({ onboardingCode: code });

    prismaMock.partner.findUnique.mockResolvedValue(null);
    expect(await resolvePartnerByOnboardingCode(code)).toBeNull();
  });

  it("keeps an existing code and creates one only when empty", async () => {
    prismaMock.partner.findUnique.mockResolvedValueOnce({ onboardingCode: "ob_existing" });
    expect(await ensureOnboardingCode("p1")).toBe("ob_existing");
    expect(prismaMock.partner.updateMany).not.toHaveBeenCalled();

    prismaMock.partner.findUnique.mockResolvedValueOnce({ onboardingCode: null }).mockResolvedValueOnce({ onboardingCode: "ob_new" });
    prismaMock.partner.updateMany.mockResolvedValue({ count: 1 });
    expect(await ensureOnboardingCode("p1")).toBe("ob_new");
    expect(prismaMock.partner.updateMany.mock.calls[0][0].where).toEqual({ id: "p1", onboardingCode: null });
  });

  it("reports whether a partner holds back merchant emails", async () => {
    expect(await partnerSuppressesMerchantEmails(null)).toBe(false);
    prismaMock.partner.findUnique.mockResolvedValue({ suppressMerchantEmails: true });
    expect(await partnerSuppressesMerchantEmails("p1")).toBe(true);
    prismaMock.partner.findUnique.mockResolvedValue({ suppressMerchantEmails: false });
    expect(await partnerSuppressesMerchantEmails("p1")).toBe(false);
  });
});
