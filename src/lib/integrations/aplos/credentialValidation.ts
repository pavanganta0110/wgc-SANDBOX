import crypto from "crypto";

/**
 * Validates raw Aplos connection input submitted by the browser before it is
 * ever encrypted or sent to Aplos. All three fields arrive as JSON string
 * fields (never multipart/FormData — see connect/route.ts) so nothing here
 * ever touches disk; the browser reads the private-key file client-side
 * (File/FileReader) and submits its text content as a normal string.
 */

const MAX_CLIENT_ID_LENGTH = 200;
const MAX_ACCOUNT_ID_LENGTH = 200;
// A 4096-bit RSA private key in PEM is a few KB at most; 16KB is generous
// headroom while still rejecting anything that couldn't plausibly be a
// single RSA key (e.g. an accidentally-pasted certificate bundle or an
// unrelated file).
const MAX_PRIVATE_KEY_LENGTH = 16_384;

export interface ValidatedCredentialInput {
  clientId: string;
  privateKeyMaterial: string;
  aplosAccountId: string;
}

export type CredentialValidationError =
  | "MISSING_CLIENT_ID"
  | "INVALID_CLIENT_ID"
  | "MISSING_PRIVATE_KEY"
  | "PRIVATE_KEY_TOO_LARGE"
  | "INVALID_PRIVATE_KEY_FORMAT"
  | "MISSING_ACCOUNT_ID"
  | "INVALID_ACCOUNT_ID";

export class CredentialValidationFailure extends Error {
  readonly code: CredentialValidationError;
  constructor(code: CredentialValidationError, message: string) {
    super(message);
    this.name = "CredentialValidationFailure";
    this.code = code;
  }
}

/** Loads an Aplos private key exactly like authProvider.ts's loadPrivateKey
 * — duplicated narrowly (not imported) because authProvider.ts's version is
 * not exported and this needs to run as a pre-flight format check before any
 * network call, independent of the auth flow itself. Accepts PEM or raw
 * base64 PKCS8 DER — see authProvider.ts for why both are accepted and which
 * one is actually documented by Aplos. */
function tryLoadPrivateKey(material: string): boolean {
  try {
    const trimmed = material.trim();
    if (trimmed.includes("-----BEGIN")) {
      crypto.createPrivateKey({ key: trimmed, format: "pem" });
    } else {
      const der = Buffer.from(trimmed, "base64");
      crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes raw connection input. Throws
 * CredentialValidationFailure with a safe, specific code on the first
 * problem found — never partial-validates. This is a pre-flight check only:
 * it confirms the private key is at least a well-formed RSA key Node can
 * load, not that it's the correct key for the given client id (that can
 * only be confirmed by a real Aplos auth attempt — see connectionService.ts
 * and authProvider.ts's documented note on RSA implicit rejection).
 */
export function validateCredentialInput(input: {
  clientId?: unknown;
  privateKeyMaterial?: unknown;
  aplosAccountId?: unknown;
}): ValidatedCredentialInput {
  if (typeof input.clientId !== "string" || input.clientId.trim() === "") {
    throw new CredentialValidationFailure("MISSING_CLIENT_ID", "Aplos Client ID is required.");
  }
  const clientId = input.clientId.trim();
  if (clientId.length > MAX_CLIENT_ID_LENGTH) {
    throw new CredentialValidationFailure("INVALID_CLIENT_ID", "Aplos Client ID is longer than expected.");
  }

  if (typeof input.privateKeyMaterial !== "string" || input.privateKeyMaterial.trim() === "") {
    throw new CredentialValidationFailure("MISSING_PRIVATE_KEY", "A private key is required.");
  }
  const privateKeyMaterial = input.privateKeyMaterial.trim();
  if (privateKeyMaterial.length > MAX_PRIVATE_KEY_LENGTH) {
    throw new CredentialValidationFailure("PRIVATE_KEY_TOO_LARGE", "The uploaded private key file is larger than expected for an RSA key.");
  }
  if (!tryLoadPrivateKey(privateKeyMaterial)) {
    throw new CredentialValidationFailure(
      "INVALID_PRIVATE_KEY_FORMAT",
      "The uploaded file is not a valid RSA private key (expected PEM or a raw base64-encoded PKCS8 key)."
    );
  }

  if (typeof input.aplosAccountId !== "string" || input.aplosAccountId.trim() === "") {
    throw new CredentialValidationFailure("MISSING_ACCOUNT_ID", "The Aplos organization/account identifier is required.");
  }
  const aplosAccountId = input.aplosAccountId.trim();
  if (aplosAccountId.length > MAX_ACCOUNT_ID_LENGTH) {
    throw new CredentialValidationFailure("INVALID_ACCOUNT_ID", "The Aplos organization/account identifier is longer than expected.");
  }

  return { clientId, privateKeyMaterial, aplosAccountId };
}
