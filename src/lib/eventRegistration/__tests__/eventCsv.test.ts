import { describe, it, expect } from "vitest";
import { buildEventCsv, formatPhoneForExport, type ExportRegistration, type ExportAttendee } from "@/lib/eventRegistration/eventCsv";
import type { CustomFieldDefinition } from "@/lib/eventRegistration/customFields";

const fields: CustomFieldDefinition[] = [
  { id: "shirt", label: "Shirt size", type: "DROPDOWN", required: false, appliesTo: "ATTENDEE", options: ["S", "M"] },
  { id: "waiver", label: "Waiver accepted", type: "CHECKBOX", required: true, appliesTo: "REGISTRATION" },
];

const reg: ExportRegistration = {
  id: "r1",
  confirmationCode: "ABCD2345",
  status: "CONFIRMED",
  registrantFirstName: "Pat",
  registrantLastName: "Lee",
  registrantEmail: "pat@example.com",
  registrantPhone: "+15555550123",
  groupName: "Team Rocket",
  customResponsesJson: { waiver: true },
  registrationAmountCents: 10000,
  addOnsAmountCents: 2500,
  donationAmountCents: 1000,
  totalCents: 13500,
  paymentId: "p1",
  createdAt: new Date("2026-05-02T15:00:00Z"),
  paidAt: new Date("2026-05-02T15:00:05Z"),
};
const attendees: ExportAttendee[] = [
  { registrationId: "r1", firstName: "Pat", lastName: "Lee", email: "pat@example.com", phone: null, customResponsesJson: { shirt: "M" }, checkedIn: true, checkedInAt: new Date("2026-06-01T23:30:00Z"), createdAt: new Date("2026-05-02T15:00:00Z") },
  { registrationId: "r1", firstName: "Jo", lastName: "Lee", email: null, phone: null, customResponsesJson: { shirt: "S" }, checkedIn: false, checkedInAt: null, createdAt: new Date("2026-05-02T15:00:01Z") },
];

function csv(over: Partial<Parameters<typeof buildEventCsv>[0]> = {}) {
  return buildEventCsv({
    eventName: "Spring Gala",
    timezone: "America/Chicago",
    fields,
    registrations: [reg],
    attendees,
    addOnLines: [{ registrationId: "r1", nameSnapshot: "T-shirt", quantity: 2 }],
    paymentStatusById: new Map([["p1", "SUCCEEDED"]]),
    ...over,
  });
}
const lines = (text: string) => text.replace("\uFEFF", "").split("\r\n");

describe("buildEventCsv", () => {
  it("starts with a UTF-8 BOM and uses CRLF so Excel opens it cleanly", () => {
    const out = csv();
    expect(out.startsWith("\uFEFF")).toBe(true);
    expect(out).toContain("\r\n");
  });

  it("has one row per attendee under a header with every requested column", () => {
    const rows = lines(csv());
    expect(rows).toHaveLength(3);
    for (const h of ["Event", "Registration ID", "Registrant First Name", "Attendee First Name", "Group", "Shirt size", "Waiver accepted", "Add-ons", "Total Amount", "Registered At", "Checked In"]) {
      expect(rows[0]).toContain(h);
    }
  });

  it("puts money only on a registration's first row so column sums are not double counted", () => {
    const header = lines(csv())[0].split(",");
    const total = header.indexOf("Total Amount");
    const rows = lines(csv()).slice(1).map((l) => l.split(","));
    expect(rows[0][total]).toBe("135.00");
    expect(rows[1][total]).toBe("");
  });

  it("includes group, custom responses, add-ons, payment status and check-in", () => {
    const [, first, second] = lines(csv());
    expect(first).toContain("Team Rocket");
    expect(first).toContain("T-shirt x2");
    expect(first).toContain("SUCCEEDED");
    expect(first).toContain("Yes");
    expect(first).toContain("(555) 555-0123");
    expect(second).toContain("Jo");
    expect(second).toContain(",No,");
  });

  it("formats times in the event's timezone, not UTC", () => {
    expect(lines(csv())[1]).toContain("2026-05-02 10:00");
  });

  it("marks unpaid and free registrations", () => {
    const unpaid = lines(csv({ registrations: [{ ...reg, paymentId: null }] }))[1];
    expect(unpaid).toContain("UNPAID");
    const free = lines(csv({ registrations: [{ ...reg, paymentId: null, totalCents: 0, registrationAmountCents: 0, addOnsAmountCents: 0, donationAmountCents: 0 }] }))[1];
    expect(free).toContain("FREE");
  });

  it("neutralizes spreadsheet formulas in attacker-controlled cells", () => {
    const evil = csv({ attendees: [{ ...attendees[0], firstName: "=HYPERLINK(\"http://evil\")", lastName: "+cmd" }] });
    const row = lines(evil)[1];
    expect(row).toContain("'=HYPERLINK");
    expect(row).toContain("'+cmd");
  });

  it("quotes commas and quotes", () => {
    const out = csv({ registrations: [{ ...reg, groupName: 'Smith, "The" Team' }] });
    expect(out).toContain('"Smith, ""The"" Team"');
  });
});

describe("formatPhoneForExport", () => {
  it("formats US numbers and leaves odd ones alone", () => {
    expect(formatPhoneForExport("+15555550123")).toBe("(555) 555-0123");
    expect(formatPhoneForExport("5555550123")).toBe("(555) 555-0123");
    expect(formatPhoneForExport(null)).toBe("");
    expect(formatPhoneForExport("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });
});
