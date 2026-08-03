import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const mockPrisma = {
  invoicePublicToken: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../invoicePublicToken");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateInvoicePublicToken / hashInvoicePublicToken", () => {
  it("hashes the raw token with sha256, matching what hashInvoicePublicToken produces for the same value", async () => {
    const { generateInvoicePublicToken, hashInvoicePublicToken } = await load();
    const { token, tokenHash } = generateInvoicePublicToken();
    expect(tokenHash).toBe(hashInvoicePublicToken(token));
    expect(tokenHash).toBe(crypto.createHash("sha256").update(token).digest("hex"));
  });

  it("never generates the raw token equal to its own hash", async () => {
    const { generateInvoicePublicToken } = await load();
    const { token, tokenHash } = generateInvoicePublicToken();
    expect(token).not.toBe(tokenHash);
  });

  it("generates a cryptographically long, effectively unguessable token", async () => {
    const { generateInvoicePublicToken } = await load();
    const { token } = generateInvoicePublicToken();
    // 32 random bytes hex-encoded -> 64 hex characters.
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("ensureInvoicePublicToken", () => {
  it("mints and returns a fresh token when none is active", async () => {
    const { ensureInvoicePublicToken } = await load();
    mockPrisma.invoicePublicToken.findFirst.mockResolvedValue(null);
    mockPrisma.invoicePublicToken.create.mockResolvedValue({});

    const token = await ensureInvoicePublicToken("inv1", "church1");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(mockPrisma.invoicePublicToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ invoiceId: "inv1", churchId: "church1" }),
    });
  });

  it("throws InvoicePublicTokenAlreadyExistsError rather than silently minting a second active token", async () => {
    const { ensureInvoicePublicToken, InvoicePublicTokenAlreadyExistsError } = await load();
    mockPrisma.invoicePublicToken.findFirst.mockResolvedValue({ id: "existing" });

    await expect(ensureInvoicePublicToken("inv1", "church1")).rejects.toThrow(InvoicePublicTokenAlreadyExistsError);
    expect(mockPrisma.invoicePublicToken.create).not.toHaveBeenCalled();
  });
});

describe("regenerateInvoicePublicToken", () => {
  it("revokes any existing active token before minting the new one", async () => {
    const { regenerateInvoicePublicToken } = await load();
    mockPrisma.invoicePublicToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.invoicePublicToken.create.mockResolvedValue({});

    const token = await regenerateInvoicePublicToken("inv1", "church1");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(mockPrisma.invoicePublicToken.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: "inv1", status: "ACTIVE" },
      data: expect.objectContaining({ status: "REVOKED" }),
    });
  });
});

describe("resolveInvoicePublicToken", () => {
  it("returns null for an unknown token (no enumeration oracle)", async () => {
    const { resolveInvoicePublicToken } = await load();
    mockPrisma.invoicePublicToken.findUnique.mockResolvedValue(null);
    const result = await resolveInvoicePublicToken("deadbeef");
    expect(result).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    const { resolveInvoicePublicToken } = await load();
    mockPrisma.invoicePublicToken.findUnique.mockResolvedValue({ invoiceId: "inv1", churchId: "church1", status: "REVOKED" });
    const result = await resolveInvoicePublicToken("deadbeef");
    expect(result).toBeNull();
  });

  it("resolves an active token to its invoiceId/churchId", async () => {
    const { resolveInvoicePublicToken } = await load();
    mockPrisma.invoicePublicToken.findUnique.mockResolvedValue({ invoiceId: "inv1", churchId: "church1", status: "ACTIVE" });
    const result = await resolveInvoicePublicToken("deadbeef");
    expect(result).toEqual({ invoiceId: "inv1", churchId: "church1" });
  });
});
