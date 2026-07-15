import crypto from "crypto";

export const IRS_LETTER_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const IRS_LETTER_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface IrsLetterFileValidationResult {
  valid: boolean;
  error?: string;
}

/** Detects the real file type from its leading bytes ("magic number"), independent of the browser-supplied MIME type or filename extension. Returns null when the signature isn't recognized. */
export function detectFileSignature(bytes: Buffer): "pdf" | "jpeg" | "png" | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"; // %PDF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "png";
  return null;
}

const SIGNATURE_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
};

/**
 * Validates an IRS determination letter upload: declared MIME type,
 * size, and (when bytes are available) that the file's actual magic-byte
 * signature matches the declared type — rejects a mislabeled or
 * disguised file even if its extension/MIME type look acceptable.
 */
export function validateIrsLetterFile(input: { mimeType: string; sizeBytes: number; bytes?: Buffer }): IrsLetterFileValidationResult {
  if (!IRS_LETTER_ALLOWED_MIME_TYPES.includes(input.mimeType as any)) {
    return { valid: false, error: "Upload a PDF, JPG, JPEG, or PNG file." };
  }
  if (input.sizeBytes <= 0) {
    return { valid: false, error: "We could not upload the document. Please try again." };
  }
  if (input.sizeBytes > IRS_LETTER_MAX_SIZE_BYTES) {
    return { valid: false, error: "The selected file exceeds the allowed size." };
  }
  if (input.bytes) {
    const signature = detectFileSignature(input.bytes);
    if (!signature || SIGNATURE_TO_MIME[signature] !== input.mimeType) {
      return { valid: false, error: "Upload a PDF, JPG, JPEG, or PNG file." };
    }
  }
  return { valid: true };
}

export function computeChecksum(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Randomized, non-guessable object name — the original filename is never used in the storage path (kept only as display metadata). */
export function generateRandomFilename(mimeType: string): string {
  const ext = EXTENSION_BY_MIME[mimeType] || "bin";
  return `${crypto.randomBytes(16).toString("hex")}.${ext}`;
}

/**
 * Private-bucket object path. Church does not exist yet at onboarding time
 * (see provisionChurchAccount), so this is scoped by onboardingApplicationId
 * rather than organizationId — the closest stable identifier available
 * during onboarding.
 */
export function buildIrsLetterStorageKey(onboardingApplicationId: string, documentId: string, version: number, mimeType: string): string {
  return `onboarding-applications/${onboardingApplicationId}/internal-documents/irs-determination/${documentId}/v${version}/${generateRandomFilename(mimeType)}`;
}
