import { describe, it, expect } from "vitest";
import {
  PAYOUT_PROOF_ALLOWED_MIME_TYPES,
  PAYOUT_PROOF_MAX_FILE_SIZE_BYTES,
  PAYOUT_PROOF_MAX_FILES,
  PAYOUT_PROOF_MAX_TOTAL_SIZE_BYTES,
  sanitizeFileName,
} from "@/lib/uploads/payoutProofLimits";

describe("payoutProofLimits", () => {
  it("only allows the confirmed-safe MIME types", () => {
    expect(PAYOUT_PROOF_ALLOWED_MIME_TYPES).toEqual(["image/jpeg", "image/png", "application/pdf"]);
  });

  it("derives the total size limit from the per-file limit and max file count", () => {
    expect(PAYOUT_PROOF_MAX_TOTAL_SIZE_BYTES).toBe(PAYOUT_PROOF_MAX_FILE_SIZE_BYTES * PAYOUT_PROOF_MAX_FILES);
  });
});

describe("sanitizeFileName", () => {
  it("keeps safe characters unchanged", () => {
    expect(sanitizeFileName("bank-statement_2026.pdf")).toBe("bank-statement_2026.pdf");
  });

  it("replaces unsafe characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(sanitizeFileName("my statement (1).pdf")).toBe("my_statement__1_.pdf");
  });

  it("falls back to a default name when the input is empty", () => {
    expect(sanitizeFileName("")).toBe("document");
  });

  it("truncates very long file names", () => {
    const longName = "a".repeat(300) + ".pdf";
    expect(sanitizeFileName(longName).length).toBe(200);
  });
});
