import { describe, it, expect } from "vitest";
import { buildImportPreview, mapCsvRow } from "@/lib/donors/csvImport";

const header = ["First Name", "Last Name", "Email", "Phone", "Address", "City", "State", "ZIP", "Source / Notes"];

describe("contact-style CSV import", () => {
  it("joins First Name + Last Name into the donor name and maps address/ZIP/notes", () => {
    const input = mapCsvRow(header, ["Pat", "Lee", "pat@example.com", "(555) 555-0123", "12 Main St", "Dallas", "TX", "75001", "Met at the 2025 gala"]);
    expect(input).toMatchObject({ name: "Pat Lee", email: "pat@example.com", addressLine1: "12 Main St", city: "Dallas", state: "TX", postalCode: "75001", notes: "Met at the 2025 gala" });
  });

  it("works with only a first name, and lets an explicit Name column win", () => {
    expect(mapCsvRow(["First Name", "Email"], ["Cher", "c@x.com"]).name).toBe("Cher");
    expect(mapCsvRow(["Name", "First Name", "Last Name", "Email"], ["Full Name", "A", "B", "c@x.com"]).name).toBe("Full Name");
  });

  it("needs no donation column at all and flags duplicates by normalized email", () => {
    const csv = [header.join(","), "Pat,Lee,PAT@example.com,,,,,,", "Pat,Again,pat@example.com,,,,,,", "Sam,Ortiz,sam@example.com,,,,,,"].join("\n");
    const rows = buildImportPreview(csv, new Set(["sam@example.com"]));
    expect(rows.map((r) => r.status)).toEqual(["valid", "duplicate_in_file", "duplicate_in_org"]);
  });

  it("still rejects rows with neither email nor phone", () => {
    const rows = buildImportPreview([header.join(","), "No,Contact,,,,,,,"].join("\n"), new Set());
    expect(rows[0].status).toBe("error");
  });

  it("keeps the original donor-import headers working", () => {
    const input = mapCsvRow(["Donor Name", "Email Address", "Postal Code"], ["Jane Doe", "j@x.com", "75001"]);
    expect(input).toMatchObject({ name: "Jane Doe", email: "j@x.com", postalCode: "75001" });
    expect(input.notes).toBeUndefined();
  });
});

describe("email-only rows", () => {
  it("are valid — a guest list with no names still imports", () => {
    const rows = buildImportPreview(["Email", "a@x.com", "b@x.com"].join("\n"), new Set());
    expect(rows.map((r) => r.status)).toEqual(["valid", "valid"]);
    expect(rows[0].input.name).toBeNull();
  });

  it("a phone-only row with no name is still rejected", () => {
    const rows = buildImportPreview(["Phone", "(555) 555-0123"].join("\n"), new Set());
    expect(rows[0].status).toBe("error");
  });
});
