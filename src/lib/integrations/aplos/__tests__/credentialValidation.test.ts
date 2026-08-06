import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { validateCredentialInput, CredentialValidationFailure } from "../credentialValidation";

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const validInput = { clientId: "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6", privateKeyMaterial: privateKey, aplosAccountId: "org-123" };

describe("validateCredentialInput", () => {
  it("accepts well-formed input and returns trimmed values", () => {
    const result = validateCredentialInput({ ...validInput, clientId: `  ${validInput.clientId}  ` });
    expect(result.clientId).toBe(validInput.clientId);
    expect(result.aplosAccountId).toBe("org-123");
  });

  it("rejects a missing client id", () => {
    expect(() => validateCredentialInput({ ...validInput, clientId: undefined })).toThrow(CredentialValidationFailure);
    try {
      validateCredentialInput({ ...validInput, clientId: "" });
    } catch (err) {
      expect(err).toBeInstanceOf(CredentialValidationFailure);
      expect((err as CredentialValidationFailure).code).toBe("MISSING_CLIENT_ID");
    }
  });

  it("rejects an oversized client id", () => {
    expect(() => validateCredentialInput({ ...validInput, clientId: "x".repeat(300) })).toThrow(CredentialValidationFailure);
  });

  it("rejects a missing private key", () => {
    try {
      validateCredentialInput({ ...validInput, privateKeyMaterial: "" });
    } catch (err) {
      expect((err as CredentialValidationFailure).code).toBe("MISSING_PRIVATE_KEY");
    }
  });

  it("rejects a private key larger than expected for an RSA key", () => {
    try {
      validateCredentialInput({ ...validInput, privateKeyMaterial: "x".repeat(20_000) });
    } catch (err) {
      expect((err as CredentialValidationFailure).code).toBe("PRIVATE_KEY_TOO_LARGE");
    }
  });

  it("rejects a private key that isn't valid PEM or PKCS8 DER", () => {
    try {
      validateCredentialInput({ ...validInput, privateKeyMaterial: "not-a-real-key-at-all" });
    } catch (err) {
      expect((err as CredentialValidationFailure).code).toBe("INVALID_PRIVATE_KEY_FORMAT");
    }
  });

  it("accepts a raw base64 PKCS8 DER private key (not just PEM)", () => {
    const der = crypto.createPrivateKey(privateKey).export({ type: "pkcs8", format: "der" }).toString("base64");
    expect(() => validateCredentialInput({ ...validInput, privateKeyMaterial: der })).not.toThrow();
  });

  it("rejects a missing account identifier", () => {
    try {
      validateCredentialInput({ ...validInput, aplosAccountId: "" });
    } catch (err) {
      expect((err as CredentialValidationFailure).code).toBe("MISSING_ACCOUNT_ID");
    }
  });

  it("rejects non-string input for every field rather than coercing", () => {
    expect(() => validateCredentialInput({ clientId: 12345 as unknown as string, privateKeyMaterial: privateKey, aplosAccountId: "org" })).toThrow(
      CredentialValidationFailure
    );
  });
});
