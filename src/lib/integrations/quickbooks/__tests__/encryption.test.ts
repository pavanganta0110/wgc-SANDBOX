import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const TEST_KEY = crypto.randomBytes(32).toString("base64");

async function load() {
  return import("../encryption");
}

describe("quickbooks encryption", () => {
  const originalKey = process.env.QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(async () => {
    process.env.QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
    const mod = await load();
    mod.__resetEncryptionKeyCacheForTests();
  });

  afterEach(async () => {
    process.env.QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY = originalKey;
    const mod = await load();
    mod.__resetEncryptionKeyCacheForTests();
  });

  it("round-trips a plaintext secret through encrypt/serialize/deserialize/decrypt", async () => {
    const { encryptSecret, decryptSecret, serializeEnvelope, deserializeEnvelope } = await load();
    const plaintext = "qbo-access-token-abc123";
    const envelope = encryptSecret(plaintext);
    const raw = serializeEnvelope(envelope);
    const decoded = deserializeEnvelope(raw);
    expect(decryptSecret(decoded)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV) for the same plaintext", async () => {
    const { encryptSecret } = await load();
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("throws QuickBooksDecryptionError when the auth tag has been tampered with", async () => {
    const { encryptSecret, decryptSecret, QuickBooksDecryptionError } = await load();
    const envelope = encryptSecret("secret-value");
    const tampered = { ...envelope, ciphertext: Buffer.from("tampered-bytes").toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow(QuickBooksDecryptionError);
  });

  it("throws QuickBooksEncryptionConfigError when the key env var is missing", async () => {
    delete process.env.QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY;
    const mod = await load();
    mod.__resetEncryptionKeyCacheForTests();
    expect(() => mod.encryptSecret("x")).toThrow(mod.QuickBooksEncryptionConfigError);
  });

  it("throws QuickBooksEncryptionConfigError when the key does not decode to 32 bytes", async () => {
    process.env.QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    const mod = await load();
    mod.__resetEncryptionKeyCacheForTests();
    expect(() => mod.encryptSecret("x")).toThrow(mod.QuickBooksEncryptionConfigError);
  });

  it("computes a stable 16-character fingerprint for the active key", async () => {
    const { getActiveEncryptionKeyFingerprint } = await load();
    const first = getActiveEncryptionKeyFingerprint();
    const second = getActiveEncryptionKeyFingerprint();
    expect(first).toBe(second);
    expect(first).toHaveLength(16);
  });
});
