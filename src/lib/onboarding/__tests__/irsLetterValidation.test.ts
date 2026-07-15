import { describe, it, expect } from "vitest";
import {
  detectFileSignature,
  validateIrsLetterFile,
  computeChecksum,
  generateRandomFilename,
  buildIrsLetterStorageKey,
  IRS_LETTER_MAX_SIZE_BYTES,
} from "@/lib/onboarding/irsLetterValidation";

const PDF_HEADER = Buffer.from("%PDF-1.4\n%rest of file");
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const TEXT_FILE = Buffer.from("this is not a pdf, jpeg, or png");

describe("detectFileSignature", () => {
  it("recognizes a PDF header", () => {
    expect(detectFileSignature(PDF_HEADER)).toBe("pdf");
  });
  it("recognizes a JPEG header", () => {
    expect(detectFileSignature(JPEG_HEADER)).toBe("jpeg");
  });
  it("recognizes a PNG header", () => {
    expect(detectFileSignature(PNG_HEADER)).toBe("png");
  });
  it("returns null for an unrecognized signature", () => {
    expect(detectFileSignature(TEXT_FILE)).toBeNull();
  });
});

describe("validateIrsLetterFile", () => {
  it("accepts a well-formed PDF", () => {
    const result = validateIrsLetterFile({ mimeType: "application/pdf", sizeBytes: PDF_HEADER.length, bytes: PDF_HEADER });
    expect(result.valid).toBe(true);
  });

  it("rejects an unsupported MIME type", () => {
    const result = validateIrsLetterFile({ mimeType: "application/zip", sizeBytes: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Upload a PDF, JPG, JPEG, or PNG file.");
  });

  it("rejects a file exceeding the size limit", () => {
    const result = validateIrsLetterFile({ mimeType: "application/pdf", sizeBytes: IRS_LETTER_MAX_SIZE_BYTES + 1 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("The selected file exceeds the allowed size.");
  });

  it("accepts a file exactly at the size limit", () => {
    const result = validateIrsLetterFile({ mimeType: "application/pdf", sizeBytes: IRS_LETTER_MAX_SIZE_BYTES, bytes: PDF_HEADER });
    expect(result.valid).toBe(true);
  });

  it("rejects a zero-byte file", () => {
    const result = validateIrsLetterFile({ mimeType: "application/pdf", sizeBytes: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects a file whose declared MIME type does not match its actual signature (disguised/mislabeled file)", () => {
    const result = validateIrsLetterFile({ mimeType: "application/pdf", sizeBytes: TEXT_FILE.length, bytes: TEXT_FILE });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Upload a PDF, JPG, JPEG, or PNG file.");
  });

  it("rejects a real JPEG mislabeled as PNG", () => {
    const result = validateIrsLetterFile({ mimeType: "image/png", sizeBytes: JPEG_HEADER.length, bytes: JPEG_HEADER });
    expect(result.valid).toBe(false);
  });
});

describe("computeChecksum", () => {
  it("is deterministic for identical bytes", () => {
    expect(computeChecksum(PDF_HEADER)).toBe(computeChecksum(Buffer.from(PDF_HEADER)));
  });
  it("differs for different bytes", () => {
    expect(computeChecksum(PDF_HEADER)).not.toBe(computeChecksum(JPEG_HEADER));
  });
});

describe("generateRandomFilename", () => {
  it("uses the correct extension per MIME type", () => {
    expect(generateRandomFilename("application/pdf")).toMatch(/\.pdf$/);
    expect(generateRandomFilename("image/jpeg")).toMatch(/\.jpg$/);
    expect(generateRandomFilename("image/png")).toMatch(/\.png$/);
  });
  it("never reuses the original filename", () => {
    const name = generateRandomFilename("application/pdf");
    expect(name).not.toContain("determination-letter");
  });
  it("generates distinct names on each call", () => {
    expect(generateRandomFilename("application/pdf")).not.toBe(generateRandomFilename("application/pdf"));
  });
});

describe("buildIrsLetterStorageKey", () => {
  it("scopes the path by onboardingApplicationId, not organizationId (no Church exists yet at onboarding time)", () => {
    const key = buildIrsLetterStorageKey("app_123", "doc_456", 1, "application/pdf");
    expect(key).toContain("onboarding-applications/app_123/");
    expect(key).toContain("/internal-documents/irs-determination/");
    expect(key).toContain("/v1/");
  });

  it("never includes the original filename in the path", () => {
    const key = buildIrsLetterStorageKey("app_123", "doc_456", 1, "application/pdf");
    expect(key).not.toContain("determination-letter");
  });
});
