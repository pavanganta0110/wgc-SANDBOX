import { describe, it, expect } from "vitest";
import { detectStudentImportKind, mapGiftMethod, parseGiftDate, parseStudentGiftImport } from "../giftImportPlan";

describe("detectStudentImportKind", () => {
  it("tells a gifts file from a roster file by its columns", () => {
    expect(detectStudentImportKind("Student ID,Donor Name,Amount,Date\n1,A,10,2026-09-01")).toBe("gifts");
    expect(detectStudentImportKind("Student ID,First Name,Last Name,Term,Charge\n1,A,B,Fall 2026,100")).toBe("roster");
    expect(detectStudentImportKind("Student ID,Name,Amount\n1,A B,100")).toBe("roster");
  });
});

describe("mapGiftMethod / parseGiftDate", () => {
  it("maps free text to existing offline payment methods", () => {
    expect(mapGiftMethod("Check #4411")).toBe("CHECK");
    expect(mapGiftMethod("Card (Clover)")).toBe("EXTERNAL_CARD_TERMINAL");
    expect(mapGiftMethod("ACH")).toBe("BANK_TRANSFER");
    expect(mapGiftMethod("Cash App")).toBe("CASH_APP");
    expect(mapGiftMethod("Cash")).toBe("CASH");
    expect(mapGiftMethod("")).toBe("OTHER");
    expect(mapGiftMethod("barter")).toBe("OTHER");
  });
  it("parses real dates only, at noon UTC", () => {
    expect(parseGiftDate("2026-09-10")?.toISOString()).toBe("2026-09-10T12:00:00.000Z");
    expect(parseGiftDate("9/10/2026")?.toISOString()).toBe("2026-09-10T12:00:00.000Z");
    expect(parseGiftDate("9/10/26")?.toISOString()).toBe("2026-09-10T12:00:00.000Z");
    expect(parseGiftDate("2026-02-31")).toBeNull();
    expect(parseGiftDate("next tuesday")).toBeNull();
  });
});

describe("parseStudentGiftImport", () => {
  const csv = [
    "Student ID,Donor Name,Donor Email,Amount,Date,Type,Method,Term,Reference",
    "1001,Pat Sponsor,pat@example.test,$1,500.00,Sponsor,Check,Fall 2026,4411",
    '1001,Pat Sponsor,pat@example.test,"$1,500.00",2026-09-02,Sponsor,Check,Fall 2026,4411',
    "1002,,,250,2026-09-03,Self-paid,Card (Clover),,",
    "1003,X,bad,100,2026-09-04,Maybe,Cash,Fall 2026,",
  ].join("\n");

  it("validates each row and reports every problem", () => {
    const { rows } = parseStudentGiftImport(csv, "Fall 2026");
    expect(rows[1]).toMatchObject({ amountCents: 150000, givenFor: "SPONSOR", method: "CHECK", errors: [] });
    expect(rows[2]).toMatchObject({ givenFor: "SELF", method: "EXTERNAL_CARD_TERMINAL", termLabel: "Fall 2026", errors: [] });
    expect(rows[3].errors).toEqual(expect.arrayContaining(["Invalid donor email", expect.stringContaining("Unknown type")]));
  });

  it("gives identical rows distinct fingerprints that are stable across runs", () => {
    const twice = ["Student ID,Donor Name,Amount,Date", "1,A,50,2026-09-01", "1,A,50,2026-09-01"].join("\n");
    const a = parseStudentGiftImport(twice, "Fall 2026").rows;
    const b = parseStudentGiftImport(twice, "Fall 2026").rows;
    expect(a[0].fingerprint).not.toBe(a[1].fingerprint);
    expect(a.map((r) => r.fingerprint)).toEqual(b.map((r) => r.fingerprint));
  });

  it("needs a Student ID and an Amount column", () => {
    expect(parseStudentGiftImport("Donor Name,Amount,Date\nA,1,2026-09-01").fatalError).toMatch(/Student ID/);
    expect(parseStudentGiftImport("Student ID,Donor Name,Date\n1,A,2026-09-01").fatalError).toMatch(/Amount/);
  });
});
