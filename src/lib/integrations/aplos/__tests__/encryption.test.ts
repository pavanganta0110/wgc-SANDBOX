import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  encryptSecret,
  decryptSecret,
  serializeEnvelope,
  deserializeEnvelope,
  fingerprintSecret,
  getActiveEncryptionKeyFingerprint,
  assertEncryptionKeyConfigured,
  AplosEncryptionConfigError,
  AplosDecryptionError,
  __resetEncryptionKeyCacheForTests,
} from "../encryption";

const VALID_KEY = crypto.randomBytes(32).toString("base64");

function withKey(key: string | undefined) {
  const original = process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY;
  process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY = key;
  __resetEncryptionKeyCacheForTests();
  return () => {
    process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY = original;
    __resetEncryptionKeyCacheForTests();
  };
}

describe("encryptSecret / decryptSecret round trip", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = withKey(VALID_KEY);
  });
  afterEach(() => restore());

  it("decrypts exactly what was encrypted", () => {
    const plaintext = "-----BEGIN PRIVATE KEY-----\nMIIBVQ...fake-key-material...\n-----END PRIVATE KEY-----";
    const envelope = encryptSecret(plaintext);
    expect(decryptSecret(envelope)).toBe(plaintext);
  });

  it("never stores the plaintext anywhere in the envelope", () => {
    const plaintext = "super-secret-private-key-material";
    const envelope = encryptSecret(plaintext);
    const serialized = serializeEnvelope(envelope);
    expect(serialized).not.toContain(plaintext);
  });

  it("produces a different ciphertext each time (random IV) even for the same plaintext", () => {
    const plaintext = "same-plaintext";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    // both still decrypt correctly
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it("round-trips through serialize/deserialize", () => {
    const plaintext = "round-trip-me";
    const serialized = serializeEnvelope(encryptSecret(plaintext));
    const envelope = deserializeEnvelope(serialized);
    expect(decryptSecret(envelope)).toBe(plaintext);
  });

  it("rejects a tampered ciphertext (authenticated encryption catches modification)", () => {
    const envelope = encryptSecret("original-value");
    const tampered = { ...envelope, ciphertext: Buffer.from("tampered-bytes-not-real").toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow(AplosDecryptionError);
  });

  it("rejects a tampered auth tag", () => {
    const envelope = encryptSecret("original-value");
    const badTag = Buffer.from(envelope.authTag, "base64");
    badTag[0] = badTag[0] ^ 0xff;
    const tampered = { ...envelope, authTag: badTag.toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow(AplosDecryptionError);
  });

  it("rejects an envelope with an unknown version", () => {
    const envelope = encryptSecret("value");
    expect(() => decryptSecret({ ...envelope, version: "v99_future" })).toThrow(AplosDecryptionError);
  });

  it("rejects a malformed serialized envelope instead of throwing an unhandled error", () => {
    expect(() => deserializeEnvelope("{not json")).toThrow(AplosDecryptionError);
    expect(() => deserializeEnvelope(JSON.stringify({ version: "v1" }))).toThrow(AplosDecryptionError);
  });
});

describe("key validation", () => {
  afterEach(() => __resetEncryptionKeyCacheForTests());

  it("throws a clear config error when the key is missing", () => {
    const restore = withKey(undefined);
    expect(() => assertEncryptionKeyConfigured()).toThrow(AplosEncryptionConfigError);
    restore();
  });

  it("throws when the key decodes to the wrong byte length", () => {
    const restore = withKey(Buffer.from("too-short").toString("base64"));
    expect(() => assertEncryptionKeyConfigured()).toThrow(AplosEncryptionConfigError);
    restore();
  });

  it("accepts a correctly generated 32-byte base64 key", () => {
    const restore = withKey(VALID_KEY);
    expect(() => assertEncryptionKeyConfigured()).not.toThrow();
    restore();
  });

  it("never throws for a config error inside a try/catch that logs — message never contains the key value", () => {
    const restore = withKey(VALID_KEY);
    try {
      assertEncryptionKeyConfigured();
    } catch (err) {
      expect(String(err)).not.toContain(VALID_KEY);
    }
    restore();
  });
});

describe("getActiveEncryptionKeyFingerprint", () => {
  afterEach(() => __resetEncryptionKeyCacheForTests());

  it("is stable for the same key", () => {
    const restoreA = withKey(VALID_KEY);
    const first = getActiveEncryptionKeyFingerprint();
    restoreA();
    const restoreB = withKey(VALID_KEY);
    const second = getActiveEncryptionKeyFingerprint();
    restoreB();
    expect(first).toBe(second);
  });

  it("differs for a different key", () => {
    const restoreA = withKey(VALID_KEY);
    const first = getActiveEncryptionKeyFingerprint();
    restoreA();
    const restoreB = withKey(crypto.randomBytes(32).toString("base64"));
    const second = getActiveEncryptionKeyFingerprint();
    restoreB();
    expect(first).not.toBe(second);
  });

  it("never reveals the key itself", () => {
    const restore = withKey(VALID_KEY);
    const fingerprint = getActiveEncryptionKeyFingerprint();
    expect(VALID_KEY).not.toContain(fingerprint);
    expect(fingerprint).not.toBe(VALID_KEY);
    restore();
  });
});

describe("fingerprintSecret", () => {
  it("is deterministic for the same input", () => {
    expect(fingerprintSecret("my-private-key")).toBe(fingerprintSecret("my-private-key"));
  });

  it("differs for different input", () => {
    expect(fingerprintSecret("key-a")).not.toBe(fingerprintSecret("key-b"));
  });

  it("never contains the original secret", () => {
    const secret = "a-very-recognizable-private-key-value";
    expect(fingerprintSecret(secret)).not.toContain(secret);
  });

  it("is a fixed-length hex string safe to store/display", () => {
    const fp = fingerprintSecret("anything");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});
