import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { encryptAplosPrivateKey, decryptAplosPrivateKey, AplosCredentialKeyMismatchError } from "../credentials";
import { __resetEncryptionKeyCacheForTests, AplosDecryptionError } from "../encryption";

function withKey(key: string | undefined) {
  const original = process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY;
  process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY = key;
  __resetEncryptionKeyCacheForTests();
  return () => {
    process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY = original;
    __resetEncryptionKeyCacheForTests();
  };
}

describe("encryptAplosPrivateKey / decryptAplosPrivateKey", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = withKey(crypto.randomBytes(32).toString("base64"));
  });
  afterEach(() => restore());

  it("round-trips a private key", () => {
    const plaintext = "fake-pkcs8-private-key-material";
    const stored = encryptAplosPrivateKey(plaintext);
    const decrypted = decryptAplosPrivateKey(stored);
    expect(decrypted).toBe(plaintext);
  });

  it("never includes the plaintext key in any stored field", () => {
    const plaintext = "recognizable-secret-key-value-xyz";
    const stored = encryptAplosPrivateKey(plaintext);
    expect(stored.encryptedPrivateKey).not.toContain(plaintext);
    expect(stored.privateKeyFingerprint).not.toContain(plaintext);
    expect(stored.encryptionKeyFingerprint).not.toContain(plaintext);
  });

  it("stores a fingerprint distinct from the encrypted payload and from the encryption key fingerprint", () => {
    const stored = encryptAplosPrivateKey("some-key-material");
    expect(stored.privateKeyFingerprint).not.toBe(stored.encryptionKeyFingerprint);
  });

  it("detects a key-rotation mismatch with a specific error, instead of a generic decryption failure", () => {
    const stored = encryptAplosPrivateKey("original-key");

    // Simulate rotation: a different active encryption key is now configured.
    restore();
    restore = withKey(crypto.randomBytes(32).toString("base64"));

    expect(() => decryptAplosPrivateKey(stored)).toThrow(AplosCredentialKeyMismatchError);
  });

  it("still throws AplosDecryptionError (not the mismatch error) for genuine corruption under the same key", () => {
    const stored = encryptAplosPrivateKey("original-key");
    const corrupted = { ...stored, encryptedPrivateKey: JSON.stringify({ version: "v1", iv: "AAAA", authTag: "AAAA", ciphertext: "AAAA" }) };
    expect(() => decryptAplosPrivateKey(corrupted)).toThrow(AplosDecryptionError);
    expect(() => decryptAplosPrivateKey(corrupted)).not.toThrow(AplosCredentialKeyMismatchError);
  });
});
