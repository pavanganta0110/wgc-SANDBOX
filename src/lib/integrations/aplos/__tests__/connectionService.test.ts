import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aplosConnection: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function encryptToken(plaintext: string) {
  return crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plaintext, "utf8")).toString("base64");
}

function authSuccessResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      version: "v2_0_0",
      status: 200,
      data: { expires: new Date(Date.now() + 30 * 60_000).toISOString(), token: encryptToken("plaintext-access-token") },
    }),
  };
}

function partnersVerifyResponse(authorized: boolean, accountId: string) {
  return {
    ok: authorized,
    status: authorized ? 200 : 422,
    json: async () => ({
      version: "v2_0_1",
      status: authorized ? 200 : 422,
      data: { partner_verification: { aplos_account_id: accountId, authorized } },
      ...(authorized ? {} : { exception: { message: "Client is not authorized to access the given account.", code: 1006 } }),
    }),
  };
}

const validInput = { clientId: "client-1", privateKeyMaterial: privateKey, aplosAccountId: "org-123" };

describe("connectionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("runAplosVerification", () => {
    it("succeeds when auth and partner verification both succeed and the account matches", async () => {
      const { runAplosVerification } = await import("../connectionService");
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(true, "org-123"));

      const result = await runAplosVerification(validInput);
      expect(result).toEqual({ success: true, aplosAccountId: "org-123" });
    });

    it("fails when Aplos reports the account as unauthorized", async () => {
      const { runAplosVerification } = await import("../connectionService");
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(false, "org-123"));

      const result = await runAplosVerification(validInput);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.normalized.category).toBe("ACCESS_DENIED");
    });

    it("fails when the verified account id does not match what was requested", async () => {
      const { runAplosVerification } = await import("../connectionService");
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(true, "a-different-org"));

      const result = await runAplosVerification(validInput);
      expect(result.success).toBe(false);
    });

    it("fails when the auth step itself fails (never reaches partners/verify)", async () => {
      const { runAplosVerification } = await import("../connectionService");
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ version: "v2_0_0", status: 401, exception: { message: "Token could not be located.", code: 1002 } }),
      });

      const result = await runAplosVerification(validInput);
      expect(result.success).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1); // never called partners/verify
    });
  });

  describe("testConnection", () => {
    it("never creates a row when none exists, even on success", async () => {
      const { testConnection } = await import("../connectionService");
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(true, "org-123"));

      const result = await testConnection("church-1", validInput);
      expect(result.success).toBe(true);
      expect(prisma.aplosConnection.update).not.toHaveBeenCalled();
    });

    it("updates lastConnectionTestAt on an existing row on success, without touching the credential", async () => {
      const { testConnection } = await import("../connectionService");
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ churchId: "church-1" } as never);
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(true, "org-123"));

      await testConnection("church-1", validInput);
      const updateCall = vi.mocked(prisma.aplosConnection.update).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateCall.data).toHaveProperty("lastConnectionTestAt");
      expect(updateCall.data).not.toHaveProperty("encryptedPrivateKey");
      expect(updateCall.data).not.toHaveProperty("status");
    });

    it("records the error on an existing row on failure, without touching the credential", async () => {
      const { testConnection } = await import("../connectionService");
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ churchId: "church-1" } as never);
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(false, "org-123"));

      await testConnection("church-1", validInput);
      const updateCall = vi.mocked(prisma.aplosConnection.update).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateCall.data).toHaveProperty("lastErrorCode");
      expect(updateCall.data).not.toHaveProperty("encryptedPrivateKey");
      expect(updateCall.data).not.toHaveProperty("status");
    });
  });

  describe("connectOrganization", () => {
    it("on success, upserts CONNECTED status with the encrypted credential", async () => {
      const { connectOrganization } = await import("../connectionService");
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(true, "org-123"));

      const outcome = await connectOrganization("church-1", validInput, "My Church");
      expect(outcome.connected).toBe(true);

      const upsertCall = vi.mocked(prisma.aplosConnection.upsert).mock.calls[0][0] as { create: Record<string, unknown> };
      expect(upsertCall.create.status).toBe("CONNECTED");
      expect(upsertCall.create.aplosOrganizationId).toBe("org-123");
      expect(upsertCall.create.aplosOrganizationName).toBe("My Church");
      expect(upsertCall.create).toHaveProperty("encryptedPrivateKey");
      expect(upsertCall.create.encryptedPrivateKey).not.toContain(privateKey); // never plaintext
    });

    it("on failure with no existing row, never creates one and never persists any credential", async () => {
      const { connectOrganization } = await import("../connectionService");
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(false, "org-123"));

      const outcome = await connectOrganization("church-1", validInput, null);
      expect(outcome.connected).toBe(false);
      expect(prisma.aplosConnection.upsert).not.toHaveBeenCalled();
      expect(prisma.aplosConnection.update).not.toHaveBeenCalled();
    });

    it("on failure with an existing CONNECTED row, only updates status/error fields — never overwrites the stored credential", async () => {
      const { connectOrganization } = await import("../connectionService");
      const { prisma } = await import("@/lib/prisma");
      vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ churchId: "church-1", status: "CONNECTED" } as never);
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(authSuccessResponse()).mockResolvedValueOnce(partnersVerifyResponse(false, "org-123"));

      const outcome = await connectOrganization("church-1", validInput, null);
      expect(outcome.connected).toBe(false);
      expect(prisma.aplosConnection.upsert).not.toHaveBeenCalled();
      const updateCall = vi.mocked(prisma.aplosConnection.update).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateCall.data).not.toHaveProperty("encryptedPrivateKey");
      expect(updateCall.data.status).toBe("INVALID_CREDENTIALS");
    });

    it("rejects malformed input before ever calling Aplos or touching the database", async () => {
      const { connectOrganization } = await import("../connectionService");
      const { prisma } = await import("@/lib/prisma");
      await expect(connectOrganization("church-1", { clientId: "", privateKeyMaterial: "", aplosAccountId: "" }, null)).rejects.toThrow();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(prisma.aplosConnection.upsert).not.toHaveBeenCalled();
    });
  });

  describe("disconnectConnection", () => {
    it("marks the connection DISCONNECTED, disables sync, and removes the stored credential", async () => {
      const { disconnectConnection } = await import("../connectionService");
      const { prisma } = await import("@/lib/prisma");

      await disconnectConnection("church-1");

      const updateCall = vi.mocked(prisma.aplosConnection.update).mock.calls[0][0] as { where: unknown; data: Record<string, unknown> };
      expect(updateCall.where).toEqual({ churchId: "church-1" });
      expect(updateCall.data.status).toBe("DISCONNECTED");
      expect(updateCall.data.automaticSyncEnabled).toBe(false);
      expect(updateCall.data.encryptedPrivateKey).not.toBe(privateKey);
      expect(updateCall.data).toHaveProperty("disconnectedAt");
    });
  });
});
