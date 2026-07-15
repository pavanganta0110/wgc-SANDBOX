/**
 * File-upload limits for payout-account "Supporting Bank Proof" evidence.
 *
 * A live test against WGC's actual Finix sandbox credentials (POST /files)
 * was attempted before setting these — it returned an unrelated 406 even
 * on the baseline confirmed-working request shape (image/jpeg, the exact
 * payload this app's own createFileResource() sends in production), which
 * means the test environment itself had an issue unrelated to file type —
 * it did NOT produce a clean confirmation either way for tiff/csv/xls/xlsx
 * or larger file sizes. Per "do not hardcode limits unless they match the
 * current API behavior available to WGC," this keeps the one MIME
 * allowlist and size limit already confirmed working everywhere else in
 * this codebase (onboarding documents, support ticket attachments,
 * organization documents — all image/jpeg, image/png, application/pdf,
 * 10MB) rather than asserting the wider set works.
 *
 * MAX_FILES is a WGC-side UX limit (not a processor claim) and is safe to
 * set independently of what Finix itself allows.
 *
 * To expand this once WGC's Finix account team confirms broader support
 * (e.g. tiff/csv/xls/xlsx, larger files), change only this file.
 */
export const PAYOUT_PROOF_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"];
export const PAYOUT_PROOF_ALLOWED_EXTENSIONS_LABEL = "JPG, PNG, or PDF";
export const PAYOUT_PROOF_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — confirmed working elsewhere in this codebase
export const PAYOUT_PROOF_MAX_FILES = Number(process.env.PAYOUT_PROOF_MAX_FILES || 8);
export const PAYOUT_PROOF_MAX_TOTAL_SIZE_BYTES = PAYOUT_PROOF_MAX_FILE_SIZE_BYTES * PAYOUT_PROOF_MAX_FILES;

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "document";
}
