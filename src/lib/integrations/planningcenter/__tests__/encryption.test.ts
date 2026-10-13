import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const TEST_KEY = crypto.randomBytes(32).toString("base64");

async function load() {
  return import("../encryption");
}

describe("planning center encryption", () => {
  const originalKey = process.env.PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(async () => {
    process.env.PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
    (await load()).__resetEncryptionKeyCacheForTests();
  });

  afterEach(async () => {
    if (originalKey === undefined) delete process.env.PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY = originalKey;
    (await load()).__resetEncryptionKeyCacheForTests();
  });

  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret, serializeEnvelope, deserializeEnvelope } = await load();
    const raw = serializeEnvelope(encryptSecret("pco-access-token"));
    expect(raw).not.toContain("pco-access-token");
    expect(decryptSecret(deserializeEnvelope(raw))).toBe("pco-access-token");
  });

  it("uses a fresh IV each time", async () => {
    const { encryptSecret } = await load();
    expect(encryptSecret("same").iv).not.toBe(encryptSecret("same").iv);
  });

  it("rejects a tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret, PlanningCenterDecryptionError } = await load();
    const envelope = encryptSecret("secret");
    const tampered = { ...envelope, ciphertext: Buffer.from("garbage").toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow(PlanningCenterDecryptionError);
  });

  it("fails clearly when the key is missing", async () => {
    delete process.env.PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY;
    const { encryptSecret, __resetEncryptionKeyCacheForTests, PlanningCenterEncryptionConfigError } = await load();
    __resetEncryptionKeyCacheForTests();
    expect(() => encryptSecret("x")).toThrow(PlanningCenterEncryptionConfigError);
  });

  it("detects a key mismatch via the stored fingerprint", async () => {
    const { encryptPlanningCenterTokens, decryptPlanningCenterAccessToken } = await import("../credentials");
    const enc = encryptPlanningCenterTokens("a", "r");
    expect(decryptPlanningCenterAccessToken({ accessTokenEncrypted: enc.accessTokenEncrypted, encryptionKeyFingerprint: enc.encryptionKeyFingerprint })).toBe("a");
    expect(() => decryptPlanningCenterAccessToken({ accessTokenEncrypted: enc.accessTokenEncrypted, encryptionKeyFingerprint: "deadbeefdeadbeef" })).toThrow(/different PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY/);
  });
});
