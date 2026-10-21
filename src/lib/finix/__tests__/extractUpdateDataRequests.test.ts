import { describe, it, expect } from "vitest";
import { extractUpdateDataRequests, formFieldForFinixField, formFieldForRequest } from "../parseVerificationOutcomes";

describe("extractUpdateDataRequests", () => {
  it("returns update-data outcomes, skips file uploads and dedupes repeats", () => {
    const v = {
      outcomes: [
        { outcome_message: " Provide a website ", remediation_details: { type: "UPDATE_DATA", field_name: "url" } },
        { outcome_message: "Ownership invalid", remediation_details: { field_name: "principal_percentage_ownership" } },
        { outcome_message: "Ownership invalid", remediation_details: { field_name: "principal_percentage_ownership" } },
        { outcome_message: "Upload a bill", remediation_details: { type: "FILE_UPLOAD", file_type: "BANK_STATEMENT_ONE_MONTH", field_name: "ignored" } },
        { outcome_message: "no remediation" },
        { outcome_code: "NO_MESSAGE_NO_FIELD" },
      ],
    };
    expect(extractUpdateDataRequests(v)).toEqual([
      { fieldName: "url", message: "Provide a website" },
      { fieldName: "principal_percentage_ownership", message: "Ownership invalid" },
      { fieldName: "", message: "no remediation" },
    ]);
  });
  it("tolerates a missing or malformed verification", () => {
    expect(extractUpdateDataRequests(null)).toEqual([]);
    expect(extractUpdateDataRequests({ outcomes: "nope" })).toEqual([]);
  });
});

describe("formFieldForFinixField", () => {
  it("maps known Finix fields (with or without an entity. prefix) to the form's inputs", () => {
    expect(formFieldForFinixField("entity.url")).toBe("website");
    expect(formFieldForFinixField("tax_id")).toBe("ssn");
    expect(formFieldForFinixField("personal_address")).toBe("address");
    expect(formFieldForFinixField("business_phone")).toBe("businessPhone");
  });
  it("returns null for fields the form has no input for so they surface in the note prompt", () => {
    expect(formFieldForFinixField("business_address")).toBeNull();
    expect(formFieldForFinixField("dob")).toBeNull();
  });
});

describe("formFieldForRequest (field name first, underwriter wording as a fallback)", () => {
  const msg = (message: string) => formFieldForRequest({ fieldName: "", message });
  it("maps the real underwriter wording we have seen to the right inputs", () => {
    expect(msg("Facebook link provided is not a valid link - Please provide a Website, or any other social link")).toBe("website");
    expect(msg("Current ownership is not valid - We are seeing this is a non profit organization - this type of business does not have owners.")).toBe("ownership");
    expect(msg("Current SSN for Del Ficke is EIN - This should be Principal's Social Security Number - please update")).toBe("ssn");
    expect(msg("Current address for Del Ficke is business address - Please update to reflect principal's residential address")).toBe("address");
    expect(msg("Phone Number does not link to business - please ensure that the number is correct.")).toBe("businessPhone");
    expect(msg("The routing number is invalid for this bank account")).toBe("bank");
  });
  it("prefers Finix's field name over the wording", () => {
    expect(formFieldForRequest({ fieldName: "entity.mcc", message: "please fix the phone" })).toBe("mcc");
  });
  it("returns null when nothing matches so the request lands in the note prompt", () => {
    expect(msg("Date of birth is missing")).toBeNull();
  });
});
