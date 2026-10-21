import {
  encryptSecret,
  decryptSecret,
  serializeEnvelope,
  deserializeEnvelope,
  getActiveEncryptionKeyFingerprint,
} from "./encryption";
import { PlanningCenterConnectionError } from "./errors";

/**
 * The only module that touches a plaintext Planning Center access/refresh
 * token outside the auth provider itself.
 */

export interface EncryptedTokenFields {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  encryptionKeyFingerprint: string;
}

export function encryptPlanningCenterTokens(accessToken: string, refreshToken: string): EncryptedTokenFields {
  return {
    accessTokenEncrypted: serializeEnvelope(encryptSecret(accessToken)),
    refreshTokenEncrypted: serializeEnvelope(encryptSecret(refreshToken)),
    encryptionKeyFingerprint: getActiveEncryptionKeyFingerprint(),
  };
}

function assertKeyMatches(storedFingerprint: string | null | undefined): void {
  if (storedFingerprint && storedFingerprint !== getActiveEncryptionKeyFingerprint()) {
    throw new PlanningCenterConnectionError(
      "This Planning Center connection was encrypted with a different PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY than the one currently configured. The organization must reconnect Planning Center."
    );
  }
}

export function decryptPlanningCenterAccessToken(fields: { accessTokenEncrypted: string; encryptionKeyFingerprint: string | null }): string {
  assertKeyMatches(fields.encryptionKeyFingerprint);
  return decryptSecret(deserializeEnvelope(fields.accessTokenEncrypted));
}

export function decryptPlanningCenterRefreshToken(fields: { refreshTokenEncrypted: string; encryptionKeyFingerprint: string | null }): string {
  assertKeyMatches(fields.encryptionKeyFingerprint);
  return decryptSecret(deserializeEnvelope(fields.refreshTokenEncrypted));
}
