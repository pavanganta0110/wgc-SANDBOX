import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { decryptAccessToken, ManualCredentialAuthProvider, AplosAuthError, type AplosCredentials } from "../authProvider";

// Real RSA keypair — used to prove our decrypt implementation is actually
// correct against the documented RSA/ECB/PKCS1Padding algorithm, not just
// self-consistent. No live Aplos call is made anywhere in this file.
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function aplosEncryptToken(plaintext: string): string {
  return crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plaintext, "utf8")).toString("base64");
}

describe("decryptAccessToken", () => {
  it("decrypts a token encrypted per Aplos's documented RSA/ECB/PKCS1Padding algorithm, using a PEM private key", () => {
    const plaintextToken = "DgSAfTJppyiY3riXi7OF9LkdCVsdYV61biV6YawS9AKJAmfGLXfK3N00";
    const encrypted = aplosEncryptToken(plaintextToken);
    expect(decryptAccessToken(encrypted, privateKey)).toBe(plaintextToken);
  });

  it("also accepts a raw base64 PKCS8 DER private key (no PEM headers) — matches Aplos's own documented Java example format", () => {
    const der = crypto.createPrivateKey(privateKey).export({ type: "pkcs8", format: "der" });
    const rawBase64Key = der.toString("base64");
    const plaintextToken = "some-access-token-value";
    const encrypted = aplosEncryptToken(plaintextToken);
    expect(decryptAccessToken(encrypted, rawBase64Key)).toBe(plaintextToken);
  });

  it("never recovers the real token when decrypted with the wrong private key", () => {
    // Modern OpenSSL uses "implicit rejection" for RSA-PKCS1 decryption (a
    // Bleichenbacher-attack countermeasure): decrypting with the wrong key
    // usually returns deterministic garbage bytes rather than throwing,
    // specifically so a padding-error side channel can't be exploited — but
    // depending on the specific wrong key and OpenSSL build, it can still
    // throw in some cases. Both outcomes are safe (neither ever recovers the
    // real token), so the test accepts either rather than assuming one,
    // which was flaky when this only checked for a thrown error.
    const { privateKey: wrongKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const plaintextToken = "the-real-token-value";
    const encrypted = aplosEncryptToken(plaintextToken);

    try {
      const attemptedDecrypt = decryptAccessToken(encrypted, wrongKey);
      expect(attemptedDecrypt).not.toBe(plaintextToken);
    } catch (err) {
      expect(err).toBeInstanceOf(AplosAuthError);
    }
  });
});

describe("ManualCredentialAuthProvider", () => {
  const churchId = "church-1";
  const credentials: AplosCredentials = { clientId: "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6", privateKeyMaterial: privateKey };

  function successBody(plaintextToken: string, expiresInMs: number) {
    return {
      version: "v2_0_0",
      status: 200,
      data: {
        expires: new Date(Date.now() + expiresInMs).toISOString(),
        token: aplosEncryptToken(plaintextToken),
      },
    };
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and decrypts a token on first call", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => successBody("plaintext-token-1", 30 * 60_000),
    });
    const resolveCredentials = vi.fn().mockResolvedValue(credentials);
    const provider = new ManualCredentialAuthProvider(resolveCredentials);

    const result = await provider.getAccessToken(churchId);
    expect(result.token).toBe("plaintext-token-1");
    expect(resolveCredentials).toHaveBeenCalledWith(churchId);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Auth URL confirmed exactly from Aplos's official docs.
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      `https://app.aplos.com/hermes/api/v1/auth/${credentials.clientId}`
    );
  });

  it("serves a cached token without a second fetch while it is still valid", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => successBody("cached-token", 30 * 60_000),
    });
    const provider = new ManualCredentialAuthProvider(vi.fn().mockResolvedValue(credentials));

    await provider.getAccessToken(churchId);
    const second = await provider.getAccessToken(churchId);

    expect(second.token).toBe("cached-token");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("requests a fresh token once the cached one is within the expiry buffer", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => successBody("expiring-soon", 1_000) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => successBody("refreshed-token", 30 * 60_000) });
    const provider = new ManualCredentialAuthProvider(vi.fn().mockResolvedValue(credentials));

    const first = await provider.getAccessToken(churchId);
    expect(first.token).toBe("expiring-soon");

    const second = await provider.getAccessToken(churchId);
    expect(second.token).toBe("refreshed-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never issues more than one concurrent token request for the same church (single-flight)", async () => {
    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => pending);
    const resolveCredentials = vi.fn().mockResolvedValue(credentials);
    const provider = new ManualCredentialAuthProvider(resolveCredentials);

    const callA = provider.getAccessToken(churchId);
    const callB = provider.getAccessToken(churchId);
    const callC = provider.getAccessToken(churchId);

    resolveFetch({ ok: true, status: 200, json: async () => successBody("single-flight-token", 30 * 60_000) });
    const [a, b, c] = await Promise.all([callA, callB, callC]);

    expect(a.token).toBe("single-flight-token");
    expect(b.token).toBe("single-flight-token");
    expect(c.token).toBe("single-flight-token");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(resolveCredentials).toHaveBeenCalledTimes(1);
  });

  it("classifies an expired-token response (exception code 1004) instead of throwing a raw error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ version: "v2_0_0", status: 401, exception: { message: "Token expired.", code: 1004 } }),
    });
    const provider = new ManualCredentialAuthProvider(vi.fn().mockResolvedValue(credentials));

    await expect(provider.getAccessToken(churchId)).rejects.toMatchObject({
      normalized: { category: "AUTHENTICATION_REQUIRED", aplosExceptionCode: 1004 },
    });
  });

  it("classifies a disabled-client response (exception code 1001) as non-retryable ACCESS_DENIED", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ version: "v2_0_0", status: 401, exception: { message: "The client is disabled.", code: 1001 } }),
    });
    const provider = new ManualCredentialAuthProvider(vi.fn().mockResolvedValue(credentials));

    await expect(provider.getAccessToken(churchId)).rejects.toMatchObject({
      normalized: { category: "ACCESS_DENIED", retryable: false, aplosExceptionCode: 1001 },
    });
  });

  it("classifies a network failure (fetch rejects) as a retryable temporary error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNRESET"));
    const provider = new ManualCredentialAuthProvider(vi.fn().mockResolvedValue(credentials));

    await expect(provider.getAccessToken(churchId)).rejects.toMatchObject({
      normalized: { category: "TEMPORARY_APLOS_ERROR", retryable: true },
    });
  });

  it("classifies a malformed success response (missing data.token) instead of crashing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_0", status: 200, data: { expires: new Date().toISOString() } }),
    });
    const provider = new ManualCredentialAuthProvider(vi.fn().mockResolvedValue(credentials));

    await expect(provider.getAccessToken(churchId)).rejects.toThrow(AplosAuthError);
  });

  it("invalidate() clears the cache so the next call fetches again", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => successBody("token-a", 30 * 60_000) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => successBody("token-b", 30 * 60_000) });
    const provider = new ManualCredentialAuthProvider(vi.fn().mockResolvedValue(credentials));

    await provider.getAccessToken(churchId);
    provider.invalidate(churchId);
    const second = await provider.getAccessToken(churchId);

    expect(second.token).toBe("token-b");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches per church independently — one church's token never leaks to another", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => successBody("church-1-token", 30 * 60_000) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => successBody("church-2-token", 30 * 60_000) });
    const provider = new ManualCredentialAuthProvider(vi.fn().mockResolvedValue(credentials));

    const a = await provider.getAccessToken("church-1");
    const b = await provider.getAccessToken("church-2");

    expect(a.token).toBe("church-1-token");
    expect(b.token).toBe("church-2-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
