import { describe, it, expect } from "vitest";
import { buildEventAudience } from "@/lib/eventRegistration/audience";

const registrations = [
  { id: "r1", registrantFirstName: "Pat", registrantLastName: "Lee", registrantEmail: "pat@example.com", donorId: "d1" },
  { id: "r2", registrantFirstName: "Sam", registrantLastName: "Ortiz", registrantEmail: "sam@example.com", donorId: null },
];
const attendees = [
  { registrationId: "r1", firstName: "Pat", lastName: "Lee", email: "PAT@example.com", donorId: "d1", checkedIn: true },
  { registrationId: "r1", firstName: "Kid", lastName: "Lee", email: "kid@example.com", donorId: null, checkedIn: false },
  { registrationId: "r1", firstName: "NoMail", lastName: "Lee", email: null, donorId: null, checkedIn: false },
  { registrationId: "r2", firstName: "Sam", lastName: "Ortiz", email: "sam@example.com", donorId: null, checkedIn: false },
  { registrationId: "r2", firstName: "Bad", lastName: "Address", email: "not-an-email", donorId: null, checkedIn: true },
];

const emails = (scope: Parameters<typeof buildEventAudience>[2]) => buildEventAudience(registrations, attendees, scope).map((r) => r.normalizedEmail);

describe("buildEventAudience", () => {
  it("ALL_ATTENDEES includes attendees with a valid email, even if nobody paid, and skips blank/invalid ones", () => {
    expect(emails("ALL_ATTENDEES")).toEqual(["pat@example.com", "kid@example.com", "sam@example.com"]);
  });

  it("PRIMARY_REGISTRANTS is just the people who registered", () => {
    expect(emails("PRIMARY_REGISTRANTS")).toEqual(["pat@example.com", "sam@example.com"]);
  });

  it("CHECKED_IN and NOT_CHECKED_IN split attendees on the check-in flag", () => {
    expect(emails("CHECKED_IN")).toEqual(["pat@example.com"]);
    expect(emails("NOT_CHECKED_IN")).toEqual(["kid@example.com", "sam@example.com"]);
  });

  it("EVERYONE de-duplicates a registrant who is also an attendee", () => {
    const all = emails("EVERYONE");
    expect(all).toEqual(["pat@example.com", "kid@example.com", "sam@example.com"]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("de-duplicates by normalized email, preferring the attendee's own name", () => {
    const pat = buildEventAudience(registrations, attendees, "EVERYONE").find((r) => r.normalizedEmail === "pat@example.com");
    expect(pat?.name).toBe("Pat Lee");
    expect(pat?.donorId).toBe("d1");
  });

  it("returns nothing for an event with no registrations", () => {
    expect(buildEventAudience([], [], "EVERYONE")).toEqual([]);
  });
});
