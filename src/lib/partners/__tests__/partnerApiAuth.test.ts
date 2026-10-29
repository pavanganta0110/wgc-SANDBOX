import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  partnerApiKey: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const rateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/apiRateLimit", () => ({ checkApiRateLimit: rateLimit, API_RATE_LIMIT_PER_MINUTE: 60 }));

import { authenticatePartnerApiRequest, withPartnerApiAuth } from "../partnerApiAuth";
import { generatePartnerApiKey, hashPartnerApiKey } from "../partnerApiKeys";
import { NextResponse } from "next/server";

const req = (authorization?: string) => new Request("https://wgc.test/api/v1/partner/ledger", { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockReturnValue({ allowed: true, remaining: 10 });
  prismaMock.partnerApiKey.update.mockResolvedValue({});
});

describe("authenticatePartnerApiRequest", () => {
  it("rejects a missing or malformed header", async () => {
    await expect(authenticatePartnerApiRequest(req())).rejects.toMatchObject({ type: "authentication_error" });
    await expect(authenticatePartnerApiRequest(req("Basic abc"))).rejects.toMatchObject({ type: "authentication_error" });
  });

  it("does not accept an organization key", async () => {
    await expect(authenticatePartnerApiRequest(req("Bearer wgc_live_abcdef"))).rejects.toMatchObject({ type: "authentication_error" });
    expect(prismaMock.partnerApiKey.findUnique).not.toHaveBeenCalled();
  });

  it("rejects unknown, revoked and suspended-partner keys the same way", async () => {
    const key = generatePartnerApiKey("test");
    prismaMock.partnerApiKey.findUnique.mockResolvedValue(null);
    await expect(authenticatePartnerApiRequest(req(`Bearer ${key}`))).rejects.toMatchObject({ message: "Invalid or revoked API key." });

    prismaMock.partnerApiKey.findUnique.mockResolvedValue({ id: "k1", partnerId: "p1", status: "REVOKED", partner: { status: "ACTIVE" } });
    await expect(authenticatePartnerApiRequest(req(`Bearer ${key}`))).rejects.toMatchObject({ message: "Invalid or revoked API key." });

    prismaMock.partnerApiKey.findUnique.mockResolvedValue({ id: "k1", partnerId: "p1", status: "ACTIVE", partner: { status: "SUSPENDED" } });
    await expect(authenticatePartnerApiRequest(req(`Bearer ${key}`))).rejects.toMatchObject({ message: "Invalid or revoked API key." });
  });

  it("looks the key up by its hash and returns the partner from the key's own row", async () => {
    const key = generatePartnerApiKey("test");
    prismaMock.partnerApiKey.findUnique.mockResolvedValue({ id: "k1", partnerId: "p1", status: "ACTIVE", partner: { status: "ACTIVE" } });
    const auth = await authenticatePartnerApiRequest(req(`Bearer ${key}`));
    expect(auth).toEqual({ partnerKeyId: "k1", partnerId: "p1" });
    expect(prismaMock.partnerApiKey.findUnique.mock.calls[0][0].where).toEqual({ hashedKey: hashPartnerApiKey(key) });
  });

  it("enforces the rate limit", async () => {
    const key = generatePartnerApiKey("test");
    prismaMock.partnerApiKey.findUnique.mockResolvedValue({ id: "k1", partnerId: "p1", status: "ACTIVE", partner: { status: "ACTIVE" } });
    rateLimit.mockReturnValue({ allowed: false, remaining: 0 });
    await expect(authenticatePartnerApiRequest(req(`Bearer ${key}`))).rejects.toMatchObject({ type: "rate_limit_error" });
  });
});

describe("withPartnerApiAuth", () => {
  it("returns the structured error and a request id header on failure", async () => {
    const handler = withPartnerApiAuth(async () => NextResponse.json({ ok: true }));
    const res = await handler(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect((await res.json()).error.type).toBe("authentication_error");
  });

  it("passes the authenticated partner to the handler", async () => {
    const key = generatePartnerApiKey("test");
    prismaMock.partnerApiKey.findUnique.mockResolvedValue({ id: "k1", partnerId: "p1", status: "ACTIVE", partner: { status: "ACTIVE" } });
    const handler = withPartnerApiAuth(async (_r, auth) => NextResponse.json({ partnerId: auth.partnerId }));
    const res = await handler(req(`Bearer ${key}`));
    expect(await res.json()).toEqual({ partnerId: "p1" });
  });
});
