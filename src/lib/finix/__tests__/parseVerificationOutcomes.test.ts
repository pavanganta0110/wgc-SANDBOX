import { describe, it, expect } from "vitest";
import { parseVerificationOutcomes, extractRequestedFileType, extractFileUploadRequests } from "../parseVerificationOutcomes";

describe("parseVerificationOutcomes", () => {
  it("prefers outcome_message (the underwriter's actual note) over the machine-oriented outcome_code", () => {
    const result = parseVerificationOutcomes({
      outcomes: [
        { outcome_code: "INVALID_BUSINESS_MCC", outcome_message: "The correct MCC for a religious entity is 8661.  Please update the MCC. \n" },
      ],
    });
    expect(result).toBe("• The correct MCC for a religious entity is 8661. Please update the MCC.");
  });

  it("matches the real production Verification payload for Lighthouse Baptist Church exactly (2026-09-04)", () => {
    const result = parseVerificationOutcomes({
      outcomes: [
        { outcome_code: "INVALID_BUSINESS_DBA", outcome_message: "Please provide a doing business as (DBA). This can be the same as Legal Business name if the business does not go by another name. \n", remediation_details: { type: "FIELD_UPDATE", field_name: "entity.doing_business_as" } },
        { outcome_code: "INVALID_BUSINESS_OWNERSHIP_TYPE", outcome_message: "Please provide an ownership type. \n", remediation_details: { type: "FIELD_UPDATE", field_name: "entity.ownership_type" } },
        { outcome_code: "INVALID_BUSINESS_MCC", outcome_message: "The correct MCC for a religious entity is 8661.  Please update the MCC. \n", remediation_details: { type: "FIELD_UPDATE", field_name: "entity.mcc" } },
        { outcome_code: "EDD_DOCUMENT_REQUESTED", outcome_message: "Please correct the spelling of the email address. There is a typo where it should be org. \n", remediation_details: { type: "FILE_UPLOAD" } },
      ],
    });
    expect(result).toBe(
      "• Please provide a doing business as (DBA). This can be the same as Legal Business name if the business does not go by another name.<br/>" +
      "• Please provide an ownership type.<br/>" +
      "• The correct MCC for a religious entity is 8661. Please update the MCC.<br/>" +
      "• Please correct the spelling of the email address. There is a typo where it should be org."
    );
  });

  it("falls back to the humanized outcome_code when outcome_message is absent", () => {
    const result = parseVerificationOutcomes({ outcomes: [{ outcome_code: "SOME_CODE_WITH_NO_MESSAGE" }] });
    expect(result).toBe("• Some code with no message");
  });

  it("ignores a blank/whitespace-only outcome_message and falls back to outcome_code", () => {
    const result = parseVerificationOutcomes({ outcomes: [{ outcome_code: "FALLBACK_CASE", outcome_message: "   \n  " }] });
    expect(result).toBe("• Fallback case");
  });

  it("formats outcome_code into a readable, bulleted, <br/>-joined list", () => {
    const result = parseVerificationOutcomes({
      outcomes: [
        { outcome_code: "BANK_STATEMENT_ONE_MONTH_REQUESTED" },
        { outcome_code: "BUSINESS_DBA_UPDATE_REQUESTED" },
      ],
    });
    expect(result).toBe("• Bank statement one month requested<br/>• Business dba update requested");
  });

  it("appends remediation_details.field_name in parentheses when present", () => {
    const result = parseVerificationOutcomes({
      outcomes: [{ outcome_code: "INVALID_BUSINESS_TAX_ID", remediation_details: { field_name: "entity.business_tax_id" } }],
    });
    expect(result).toBe("• Invalid business tax id (entity.business_tax_id)");
  });

  it("skips outcomes without a string outcome_code rather than throwing", () => {
    const result = parseVerificationOutcomes({ outcomes: [{}, { outcome_code: 42 }, { outcome_code: "REAL_ONE" }] });
    expect(result).toBe("• Real one");
  });

  it("returns null (not a hardcoded fallback) when outcomes is missing", () => {
    expect(parseVerificationOutcomes({ state: "FAILED" })).toBeNull();
  });

  it("returns null when outcomes is an empty array", () => {
    expect(parseVerificationOutcomes({ outcomes: [] })).toBeNull();
  });

  it("returns null for a non-object input", () => {
    expect(parseVerificationOutcomes(null)).toBeNull();
    expect(parseVerificationOutcomes(undefined)).toBeNull();
    expect(parseVerificationOutcomes("not an object")).toBeNull();
  });
});

describe("extractRequestedFileType", () => {
  it("returns the file_type from a FILE_UPLOAD outcome's remediation_details", () => {
    const result = extractRequestedFileType({
      outcomes: [
        { outcome_code: "INVALID_BUSINESS_MCC", remediation_details: { type: "FIELD_UPDATE", field_name: "entity.mcc" } },
        { outcome_code: "EDD_DOCUMENT_REQUESTED", remediation_details: { type: "FILE_UPLOAD", file_type: "ENHANCED_DUE_DILIGENCE_DOCUMENT" } },
      ],
    });
    expect(result).toBe("ENHANCED_DUE_DILIGENCE_DOCUMENT");
  });

  it("returns null when no outcome is a FILE_UPLOAD type", () => {
    const result = extractRequestedFileType({
      outcomes: [{ outcome_code: "INVALID_BUSINESS_MCC", remediation_details: { type: "FIELD_UPDATE" } }],
    });
    expect(result).toBeNull();
  });

  it("returns null when a FILE_UPLOAD outcome has no file_type string", () => {
    const result = extractRequestedFileType({ outcomes: [{ remediation_details: { type: "FILE_UPLOAD" } }] });
    expect(result).toBeNull();
  });

  it("returns null for missing outcomes or non-object input", () => {
    expect(extractRequestedFileType({})).toBeNull();
    expect(extractRequestedFileType(null)).toBeNull();
    expect(extractRequestedFileType(undefined)).toBeNull();
  });
});

describe("extractFileUploadRequests", () => {
  it("returns every distinct FILE_UPLOAD outcome, each with its file_type and note", () => {
    const result = extractFileUploadRequests({
      outcomes: [
        { outcome_code: "INVALID_BUSINESS_MCC", remediation_details: { type: "FIELD_UPDATE" } },
        { outcome_code: "BANK_STATEMENT_REQUESTED", outcome_message: "Please provide a bank statement.", remediation_details: { type: "FILE_UPLOAD", file_type: "BANK_STATEMENT" } },
        { outcome_code: "EDD_DOCUMENT_REQUESTED", outcome_message: "Please provide an EDD document.", remediation_details: { type: "FILE_UPLOAD", file_type: "ENHANCED_DUE_DILIGENCE_DOCUMENT" } },
      ],
    });
    expect(result).toEqual([
      { fileType: "BANK_STATEMENT", message: "Please provide a bank statement." },
      { fileType: "ENHANCED_DUE_DILIGENCE_DOCUMENT", message: "Please provide an EDD document." },
    ]);
  });

  it("dedupes by file_type — the same document requested twice yields one slot", () => {
    const result = extractFileUploadRequests({
      outcomes: [
        { remediation_details: { type: "FILE_UPLOAD", file_type: "BANK_STATEMENT" } },
        { remediation_details: { type: "FILE_UPLOAD", file_type: "BANK_STATEMENT" } },
      ],
    });
    expect(result).toHaveLength(1);
  });

  it("skips a FILE_UPLOAD outcome with no string file_type — nothing to tag it with", () => {
    const result = extractFileUploadRequests({ outcomes: [{ remediation_details: { type: "FILE_UPLOAD" } }] });
    expect(result).toEqual([]);
  });

  it("returns message: null when outcome_message is absent", () => {
    const result = extractFileUploadRequests({ outcomes: [{ remediation_details: { type: "FILE_UPLOAD", file_type: "X" } }] });
    expect(result).toEqual([{ fileType: "X", message: null }]);
  });

  it("returns an empty array for missing outcomes or non-object input", () => {
    expect(extractFileUploadRequests({})).toEqual([]);
    expect(extractFileUploadRequests(null)).toEqual([]);
    expect(extractFileUploadRequests(undefined)).toEqual([]);
  });
});
