import { describe, it, expect } from "vitest";
import { MAX_DOCUMENT_BYTES, buildDocumentStorageKey, validateDocumentUpload } from "@/lib/transactions/documents";

describe("validateDocumentUpload", () => {
  it("accepts common audit documents and decides the stored type from the extension", () => {
    expect(validateDocumentUpload({ name: "Invoice 42.pdf", size: 1000, type: "application/pdf" })).toEqual({
      ok: true,
      mimeType: "application/pdf",
      safeName: "Invoice_42.pdf",
    });
    expect(validateDocumentUpload({ name: "scan.JPG", size: 10, type: "image/jpeg" })).toMatchObject({ ok: true, mimeType: "image/jpeg" });
    expect(validateDocumentUpload({ name: "ledger.xlsx", size: 10, type: "" })).toMatchObject({ ok: true });
    expect(validateDocumentUpload({ name: "data.csv", size: 10, type: "application/vnd.ms-excel" })).toMatchObject({ ok: false });
  });

  it("rejects types that could run or render in the browser", () => {
    for (const name of ["page.html", "image.svg", "run.exe", "script.js", "archive.zip", "noextension"]) {
      expect(validateDocumentUpload({ name, size: 10, type: "application/pdf" }).ok).toBe(false);
    }
  });

  it("rejects a file whose reported type contradicts its extension", () => {
    expect(validateDocumentUpload({ name: "report.pdf", size: 10, type: "image/png" })).toEqual({
      ok: false,
      error: "The file type doesn't match its extension.",
    });
  });

  it("enforces size limits and rejects empty files", () => {
    expect(validateDocumentUpload({ name: "a.pdf", size: MAX_DOCUMENT_BYTES, type: "application/pdf" }).ok).toBe(true);
    expect(validateDocumentUpload({ name: "a.pdf", size: MAX_DOCUMENT_BYTES + 1, type: "application/pdf" })).toEqual({
      ok: false,
      error: "File must be under 10MB.",
    });
    expect(validateDocumentUpload({ name: "a.pdf", size: 0, type: "application/pdf" }).ok).toBe(false);
  });

  it("strips path tricks from the stored file name", () => {
    const result = validateDocumentUpload({ name: "../../etc/passwd.pdf", size: 10, type: "application/pdf" });
    expect(result.ok && result.safeName).not.toContain("/");
  });
});

describe("buildDocumentStorageKey", () => {
  it("scopes the key to the organization and transaction and is unique per upload", () => {
    const a = buildDocumentStorageKey("church-1", "TR_1", "a.pdf");
    const b = buildDocumentStorageKey("church-1", "TR_1", "a.pdf");
    expect(a.startsWith("transaction-documents/church-1/TR_1/")).toBe(true);
    expect(a.endsWith("-a.pdf")).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain("..");
  });
});
