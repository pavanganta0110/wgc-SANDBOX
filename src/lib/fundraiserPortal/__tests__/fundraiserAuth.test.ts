import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(mockCookieStore) }));

const mockPrisma = {
  fundraiserLoginToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  fundraiserPortalSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  campaignFundraiser: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("createFundraiserLoginToken / consumeFundraiserLoginToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a login token record scoped to the fundraiser", async () => {
    mockPrisma.fundraiserLoginToken.create.mockResolvedValue({});
    const { createFundraiserLoginToken } = await import("../fundraiserAuth");

    const token = await createFundraiserLoginToken("fundraiser1");

    expect(typeof token).toBe("string");
    expect(mockPrisma.fundraiserLoginToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ campaignFundraiserId: "fundraiser1" }) })
    );
  });

  it("rejects an unknown token", async () => {
    mockPrisma.fundraiserLoginToken.findUnique.mockResolvedValue(null);
    const { consumeFundraiserLoginToken } = await import("../fundraiserAuth");

    const result = await consumeFundraiserLoginToken("bogus-token");
    expect(result.ok).toBe(false);
  });

  it("rejects an already-consumed token", async () => {
    mockPrisma.fundraiserLoginToken.findUnique.mockResolvedValue({ id: "t1", campaignFundraiserId: "f1", consumedAt: new Date(), expiresAt: new Date(Date.now() + 60000) });
    const { consumeFundraiserLoginToken } = await import("../fundraiserAuth");

    const result = await consumeFundraiserLoginToken("some-token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already been used/);
  });

  it("rejects an expired token", async () => {
    mockPrisma.fundraiserLoginToken.findUnique.mockResolvedValue({ id: "t1", campaignFundraiserId: "f1", consumedAt: null, expiresAt: new Date(Date.now() - 60000) });
    const { consumeFundraiserLoginToken } = await import("../fundraiserAuth");

    const result = await consumeFundraiserLoginToken("some-token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expired/);
  });

  it("consumes a valid token, marks it used, and establishes a session cookie", async () => {
    mockPrisma.fundraiserLoginToken.findUnique.mockResolvedValue({ id: "t1", campaignFundraiserId: "f1", consumedAt: null, expiresAt: new Date(Date.now() + 60000) });
    mockPrisma.fundraiserLoginToken.update.mockResolvedValue({});
    mockPrisma.fundraiserPortalSession.create.mockResolvedValue({});

    const { consumeFundraiserLoginToken } = await import("../fundraiserAuth");
    const result = await consumeFundraiserLoginToken("some-token");

    expect(result.ok).toBe(true);
    expect(mockPrisma.fundraiserLoginToken.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: expect.objectContaining({ consumedAt: expect.any(Date) }) });
    expect(mockPrisma.fundraiserPortalSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ campaignFundraiserId: "f1" }) }));
    expect(mockCookieStore.set).toHaveBeenCalledWith("wgc_fundraiser_session", expect.any(String), expect.objectContaining({ httpOnly: true }));
  });
});

describe("requireFundraiserSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when there is no session cookie", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const { requireFundraiserSession, FundraiserAuthError } = await import("../fundraiserAuth");

    await expect(requireFundraiserSession()).rejects.toBeInstanceOf(FundraiserAuthError);
  });

  it("throws for a revoked session", async () => {
    mockCookieStore.get.mockReturnValue({ value: "tok" });
    mockPrisma.fundraiserPortalSession.findUnique.mockResolvedValue({ id: "s1", campaignFundraiserId: "f1", revokedAt: new Date(), expiresAt: new Date(Date.now() + 60000) });
    const { requireFundraiserSession, FundraiserAuthError } = await import("../fundraiserAuth");

    await expect(requireFundraiserSession()).rejects.toBeInstanceOf(FundraiserAuthError);
  });

  it("throws for an expired session", async () => {
    mockCookieStore.get.mockReturnValue({ value: "tok" });
    mockPrisma.fundraiserPortalSession.findUnique.mockResolvedValue({ id: "s1", campaignFundraiserId: "f1", revokedAt: null, expiresAt: new Date(Date.now() - 60000) });
    const { requireFundraiserSession, FundraiserAuthError } = await import("../fundraiserAuth");

    await expect(requireFundraiserSession()).rejects.toBeInstanceOf(FundraiserAuthError);
  });

  it("resolves to the fundraiser's own scope for a valid session", async () => {
    mockCookieStore.get.mockReturnValue({ value: "tok" });
    mockPrisma.fundraiserPortalSession.findUnique.mockResolvedValue({ id: "s1", campaignFundraiserId: "f1", revokedAt: null, expiresAt: new Date(Date.now() + 60000) });
    mockPrisma.campaignFundraiser.findUnique.mockResolvedValue({ id: "f1", churchId: "church-a", fundraisingCampaignId: "campaign1" });
    mockPrisma.fundraiserPortalSession.update.mockResolvedValue({});

    const { requireFundraiserSession } = await import("../fundraiserAuth");
    const result = await requireFundraiserSession();

    expect(result).toEqual({ campaignFundraiserId: "f1", churchId: "church-a", fundraisingCampaignId: "campaign1" });
  });
});
