import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTestConnection = vi.fn();
const mockGetConnectionInfo = vi.fn();
const mockDiscoverStoreId = vi.fn();
vi.mock("../realProvider", () => ({
  PrintfulProvider: vi.fn().mockImplementation(function (this: any) {
    this.testConnection = mockTestConnection;
    this.getConnectionInfo = mockGetConnectionInfo;
    this.discoverStoreId = mockDiscoverStoreId;
  }),
}));

vi.mock("../encryption", () => ({
  encryptSecret: vi.fn((plaintext: string) => ({ version: "v1", iv: "iv", authTag: "tag", ciphertext: `enc(${plaintext})` })),
  serializeEnvelope: vi.fn((envelope: unknown) => JSON.stringify(envelope)),
  deserializeEnvelope: vi.fn(),
  decryptSecret: vi.fn(),
  getActiveEncryptionKeyFingerprint: vi.fn(() => "fingerprint-1"),
}));

const mockPrisma = {
  printfulConnection: { upsert: vi.fn(), findUnique: vi.fn() },
  merchandiseSettings: { findUnique: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));

async function load() {
  vi.resetModules();
  return import("../service");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDiscoverStoreId.mockResolvedValue({ storeId: "discovered-store-9", attempts: [] });
  mockTestConnection.mockResolvedValue({ ok: true, message: "Connected to Test Store.", checkedAt: new Date() });
  mockGetConnectionInfo.mockResolvedValue({ connected: true, storeId: "store-123", accountId: "store-123", connectionType: "private_token", scopes: null });
  mockPrisma.printfulConnection.upsert.mockResolvedValue({ id: "conn-1", status: "CONNECTED", connectionType: "private_token", printfulStoreId: "store-123" });
  mockPrisma.merchandiseSettings.findUnique.mockResolvedValue({ id: "settings-1" });
});

describe("connectPrintfulWithPrivateToken", () => {
  it("rejects an empty token without ever calling Printful or storing anything", async () => {
    const { connectPrintfulWithPrivateToken } = await load();

    await expect(
      connectPrintfulWithPrivateToken({ churchId: "church-1", privateToken: "   ", storeId: "store-123", actorUserId: "user-1" })
    ).rejects.toThrow("A Printful API token is required.");

    expect(mockTestConnection).not.toHaveBeenCalled();
    expect(mockPrisma.printfulConnection.upsert).not.toHaveBeenCalled();
  });

  it("strips invisible paste artifacts (BOM/zero-width) that would make fetch reject the header", async () => {
    const { connectPrintfulWithPrivateToken } = await load();

    // A BOM mid-token is invisible in a password field but makes fetch()
    // throw before the request is ever sent.
    await connectPrintfulWithPrivateToken({
      churchId: "church-1",
      privateToken: "real-﻿token​-abc\n",
      storeId: "store-123",
      actorUserId: "user-1",
    });

    const upsertArgs = mockPrisma.printfulConnection.upsert.mock.calls[0][0];
    expect(JSON.stringify(upsertArgs.create)).toContain("enc(real-token-abc)");
  });

  it("rejects a token still containing non-ASCII after sanitizing, with an actionable message", async () => {
    const { connectPrintfulWithPrivateToken } = await load();

    await expect(
      connectPrintfulWithPrivateToken({ churchId: "church-1", privateToken: "real-tokén-abc", storeId: "store-123", actorUserId: "user-1" })
    ).rejects.toThrow("Copy the token again directly from Printful");

    expect(mockTestConnection).not.toHaveBeenCalled();
    expect(mockPrisma.printfulConnection.upsert).not.toHaveBeenCalled();
  });

  it("discovers the store id from Printful when the merchant leaves it blank", async () => {
    mockDiscoverStoreId.mockResolvedValue({ storeId: "discovered-store-9", attempts: [] });
    const { connectPrintfulWithPrivateToken } = await load();

    await connectPrintfulWithPrivateToken({ churchId: "church-1", privateToken: "real-token-abc", actorUserId: "user-1" });

    expect(mockDiscoverStoreId).toHaveBeenCalled();
    expect(mockPrisma.printfulConnection.upsert).toHaveBeenCalled();
  });

  it("only asks the merchant for a store id when Printful cannot supply one", async () => {
    mockDiscoverStoreId.mockResolvedValue({ storeId: null, attempts: ["/stores: no scope"] });
    const { connectPrintfulWithPrivateToken } = await load();

    await expect(
      connectPrintfulWithPrivateToken({ churchId: "church-1", privateToken: "real-token-abc", actorUserId: "user-1" })
    ).rejects.toThrow("Ask Printful support for your numeric Store ID");

    expect(mockPrisma.printfulConnection.upsert).not.toHaveBeenCalled();
  });

  it("validates the token against Printful BEFORE storing anything — an invalid token is never persisted", async () => {
    mockTestConnection.mockResolvedValue({ ok: false, message: "Could not connect to Printful: 401 Unauthorized", checkedAt: new Date() });
    const { connectPrintfulWithPrivateToken } = await load();

    await expect(
      connectPrintfulWithPrivateToken({ churchId: "church-1", privateToken: "bad-token", storeId: "store-123", actorUserId: "user-1" })
    ).rejects.toThrow("Could not connect to Printful: 401 Unauthorized");

    expect(mockPrisma.printfulConnection.upsert).not.toHaveBeenCalled();
  });

  it("stores the token encrypted (never plaintext) and marks the connection CONNECTED on success", async () => {
    const { connectPrintfulWithPrivateToken } = await load();
    const connection = await connectPrintfulWithPrivateToken({ churchId: "church-1", privateToken: "real-token-abc", storeId: "store-123", actorUserId: "user-1" });

    expect(mockTestConnection).toHaveBeenCalledTimes(1);
    expect(mockPrisma.printfulConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { churchId: "church-1" },
        create: expect.objectContaining({
          connectionType: "private_token",
          status: "CONNECTED",
          printfulStoreId: "store-123",
          accessTokenEncrypted: expect.stringContaining("enc(real-token-abc)"),
        }),
      })
    );
    // The raw token must never appear as a bare top-level value passed to
    // Prisma — only inside the encrypted envelope string asserted above.
    const upsertArgs = mockPrisma.printfulConnection.upsert.mock.calls[0][0];
    expect(JSON.stringify(upsertArgs.create)).not.toMatch(/"accessToken":"real-token-abc"/);
    expect(connection.status).toBe("CONNECTED");
  });
});
