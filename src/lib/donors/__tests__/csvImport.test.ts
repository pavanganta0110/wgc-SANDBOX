import { describe, it, expect } from "vitest";
import { parseCsv, mapCsvRow, validateImportRowInput, buildImportPreview, IMPORT_ROW_CAP } from "@/lib/donors/csvImport";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    const rows = parseCsv("Name,Email\nJane Doe,jane@example.com\nJohn Doe,john@example.com");
    expect(rows).toEqual([
      ["Name", "Email"],
      ["Jane Doe", "jane@example.com"],
      ["John Doe", "john@example.com"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const rows = parseCsv('Name,Address\n"Doe, Jane","123 Main St, Apt 4"');
    expect(rows).toEqual([
      ["Name", "Address"],
      ["Doe, Jane", "123 Main St, Apt 4"],
    ]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const rows = parseCsv('Name,Note\n"Jane ""JD"" Doe",hello');
    expect(rows[1][0]).toBe('Jane "JD" Doe');
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("Name,Email\r\nJane,jane@example.com\r\n");
    expect(rows).toEqual([
      ["Name", "Email"],
      ["Jane", "jane@example.com"],
    ]);
  });
});

describe("mapCsvRow", () => {
  it("maps recognized header aliases case-insensitively", () => {
    const headers = ["Full Name", "Email Address", "Phone Number", "Zip Code"];
    const input = mapCsvRow(headers, ["Jane Doe", "jane@example.com", "5551234567", "90210"]);
    expect(input.name).toBe("Jane Doe");
    expect(input.email).toBe("jane@example.com");
    expect(input.phone).toBe("5551234567");
    expect(input.postalCode).toBe("90210");
  });

  it("ignores unrecognized columns", () => {
    const input = mapCsvRow(["Favorite Color"], ["Blue"]);
    expect(input.name).toBeNull();
  });
});

describe("validateImportRowInput", () => {
  it("requires a name or company", () => {
    const errors = validateImportRowInput({
      name: null,
      email: "a@example.com",
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      companyName: null,
    });
    expect(errors).toContain("Missing donor name");
  });

  it("requires at least one of email or phone", () => {
    const errors = validateImportRowInput({
      name: "Jane Doe",
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      companyName: null,
    });
    expect(errors).toContain("At least one of email or phone is required");
  });

  it("flags an invalid email", () => {
    const errors = validateImportRowInput({
      name: "Jane Doe",
      email: "not-an-email",
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      companyName: null,
    });
    expect(errors).toContain("Invalid email");
  });

  it("passes with a name and a valid email", () => {
    const errors = validateImportRowInput({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      companyName: null,
    });
    expect(errors).toEqual([]);
  });
});

describe("buildImportPreview", () => {
  it("classifies a clean row as valid", () => {
    const rows = buildImportPreview("Name,Email\nJane Doe,jane@example.com", new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("valid");
  });

  it("classifies a row with a missing name and no email/phone as error", () => {
    const rows = buildImportPreview("Name,Email\n,", new Set());
    expect(rows[0].status).toBe("error");
    expect(rows[0].errors.length).toBeGreaterThan(0);
  });

  it("flags the second occurrence of an email within the same file as duplicate_in_file", () => {
    const rows = buildImportPreview("Name,Email\nJane Doe,jane@example.com\nJane D,jane@example.com", new Set());
    expect(rows[0].status).toBe("valid");
    expect(rows[1].status).toBe("duplicate_in_file");
  });

  it("flags a row matching an existing org donor as duplicate_in_org", () => {
    const rows = buildImportPreview("Name,Email\nJane Doe,jane@example.com", new Set(["jane@example.com"]));
    expect(rows[0].status).toBe("duplicate_in_org");
  });

  it("never treats a phone-only row without an email as a duplicate", () => {
    const rows = buildImportPreview("Name,Phone\nJane Doe,5551234567\nJohn Doe,5551234567", new Set());
    expect(rows[0].status).toBe("valid");
    expect(rows[1].status).toBe("valid");
  });

  it("caps the number of processed rows at IMPORT_ROW_CAP", () => {
    const header = "Name,Email\n";
    const dataRows = Array.from({ length: IMPORT_ROW_CAP + 50 }, (_, i) => `Donor ${i},donor${i}@example.com`).join("\n");
    const rows = buildImportPreview(header + dataRows, new Set());
    expect(rows).toHaveLength(IMPORT_ROW_CAP);
  });
});
