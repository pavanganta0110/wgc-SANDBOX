import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function reqWithAuth(header: string | null) {
  const headers = new Headers();
  if (header) headers.set("authorization", header);
  return new Request("http://x", { headers });
}

describe("authenticateApiRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a request with no Authorization header", async () => {
    const { authenticateApiRequest } = await import("../apiAuth");
    await expect(authenticateApiRequest(reqWithAuth(null))).rejects.toMatchObject({ type: "authentication_error" });
  });

  it("rejects a malformed Authorization header (wrong prefix)", async () => {
    const { authenticateApiRequest } = await import("../apiAuth");
    await expect(authenticateApiRequest(reqWithAuth("Bearer sk_wrong_prefix"))).rejects.toMatchObject({ type: "authentication_error" });
  });

  it("rejects a key that doesn't exist", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);
    const { authenticateApiRequest } = await import("../apiAuth");
    await expect(authenticateApiRequest(reqWithAuth("Bearer wgc_live_nonexistent"))).rejects.toMatchObject({ type: "authentication_error" });
  });

  it("rejects a revoked key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "REVOKED", scopesJson: ["donors:read"] });
    const { authenticateApiRequest } = await import("../apiAuth");
    await expect(authenticateApiRequest(reqWithAuth("Bearer wgc_live_revoked"))).rejects.toMatchObject({ type: "authentication_error" });
  });

  it("returns the churchId and scopes from the key's own row — never trusts anything from the request itself", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "ACTIVE", scopesJson: ["donors:read", "campaigns:write"] });
    const { authenticateApiRequest } = await import("../apiAuth");
    const auth = await authenticateApiRequest(reqWithAuth("Bearer wgc_live_valid"));

    expect(auth.churchId).toBe("church-a");
    expect(auth.apiKeyId).toBe("k1");
    expect(auth.scopes).toEqual(["donors:read", "campaigns:write"]);
  });

  it("filters out any invalid/unrecognized scope strings stored on the key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "ACTIVE", scopesJson: ["donors:read", "not-a-real-scope"] });
    const { authenticateApiRequest } = await import("../apiAuth");
    const auth = await authenticateApiRequest(reqWithAuth("Bearer wgc_live_valid"));

    expect(auth.scopes).toEqual(["donors:read"]);
  });

  it("records lastUsedAt on a successful authentication", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "ACTIVE", scopesJson: [] });
    const { authenticateApiRequest } = await import("../apiAuth");
    await authenticateApiRequest(reqWithAuth("Bearer wgc_live_valid"));

    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({ where: { id: "k1" }, data: { lastUsedAt: expect.any(Date) } });
  });
});

describe("requireScope", () => {
  it("throws authorization_error when the key lacks the required scope", async () => {
    const { requireScope } = await import("../apiAuth");
    expect(() => requireScope({ apiKeyId: "k1", churchId: "c1", scopes: ["donors:read"], rateLimitRemaining: 100 }, "campaigns:write")).toThrow(
      expect.objectContaining({ type: "authorization_error" })
    );
  });

  it("does not throw when the key has the required scope", async () => {
    const { requireScope } = await import("../apiAuth");
    expect(() => requireScope({ apiKeyId: "k1", churchId: "c1", scopes: ["donors:read"], rateLimitRemaining: 100 }, "donors:read")).not.toThrow();
  });
});
