import crypto from "crypto";
import { sanitizeFileName } from "@/lib/uploads/payoutProofLimits";

/**
 * Supporting documents attached to a transaction (audit evidence: invoices,
 * approvals, receipts from vendors). The server decides the stored content
 * type from the file extension — never the client-supplied one — and only
 * ever hands a file back as a forced download, so an uploaded file can't be
 * rendered inline in the dashboard's origin.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB per file
export const MAX_DOCUMENTS_PER_TRANSACTION = 25;

const TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  csv: "text/csv",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const DOCUMENT_TYPES_LABEL = "PDF, image (PNG, JPG, WebP, HEIC), Word, Excel, CSV or text";
export const DOCUMENT_ACCEPT_ATTRIBUTE = Object.keys(TYPES_BY_EXTENSION).map((e) => `.${e}`).join(",");

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i === -1 ? "" : fileName.slice(i + 1).toLowerCase();
}

export type DocumentValidation = { ok: true; mimeType: string; safeName: string } | { ok: false; error: string };

/** Checks a file's name and size and resolves the content type to store. The client-sent type is only a sanity check. */
export function validateDocumentUpload(file: { name: string; size: number; type?: string }): DocumentValidation {
  if (!file.name) return { ok: false, error: "The file has no name." };
  if (file.size <= 0) return { ok: false, error: "The file is empty." };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "File must be under 10MB." };
  const mimeType = TYPES_BY_EXTENSION[extensionOf(file.name)];
  if (!mimeType) return { ok: false, error: `Unsupported file type. Use ${DOCUMENT_TYPES_LABEL}.` };
  // A named PDF that the browser reports as an executable (or similar) is rejected rather than trusted.
  const sent = (file.type ?? "").toLowerCase();
  const knownTypes = new Set(Object.values(TYPES_BY_EXTENSION));
  if (sent && sent !== "application/octet-stream" && knownTypes.has(sent) && sent !== mimeType) {
    const sameFamily = (sent === "image/jpeg" && mimeType === "image/jpeg") || (sent === "text/plain" && mimeType === "text/csv");
    if (!sameFamily) return { ok: false, error: "The file type doesn't match its extension." };
  }
  return { ok: true, mimeType, safeName: sanitizeFileName(file.name) };
}

/** Private storage key: organization and transaction scoped, with an unguessable id. Never reused or user-controlled. */
export function buildDocumentStorageKey(churchId: string, finixTransferId: string, safeName: string): string {
  return `transaction-documents/${churchId}/${finixTransferId}/${crypto.randomUUID()}-${safeName}`;
}
