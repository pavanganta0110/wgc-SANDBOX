import { describe, it, expect } from "vitest";
import { getRegistrationState, parseEventPaymentMethods, validateEventSettings, validateAddOns, generateConfirmationCode } from "@/lib/eventRegistration/eventConfig";
import { zonedLocalToUtc, utcToZonedLocal, formatEventDate, formatEventTime } from "@/lib/eventRegistration/timezone";
import { slugifyEventName } from "@/lib/eventRegistration/eventSlug";

const base = { name: "Spring Event", startsAtLocal: "2030-05-02T18:00", timezone: "America/Chicago" };

describe("getRegistrationState", () => {
  const event = { status: "ACTIVE", startsAt: new Date("2030-05-02T23:00:00Z"), endsAt: null, registrationOpensAt: null, registrationClosesAt: null };
  const now = new Date("2030-04-01T12:00:00Z");

  it("is open for an active upcoming event", () => {
    expect(getRegistrationState(event, now)).toEqual({ open: true });
  });
  it("is closed unless ACTIVE", () => {
    for (const status of ["DRAFT", "INACTIVE", "ARCHIVED"]) expect(getRegistrationState({ ...event, status }, now)).toMatchObject({ open: false, reason: "NOT_ACTIVE" });
  });
  it("respects the open and close window", () => {
    expect(getRegistrationState({ ...event, registrationOpensAt: new Date("2030-04-15T00:00:00Z") }, now)).toMatchObject({ reason: "NOT_YET_OPEN" });
    expect(getRegistrationState({ ...event, registrationClosesAt: new Date("2030-03-31T00:00:00Z") }, now)).toMatchObject({ reason: "CLOSED" });
  });
  it("closes once the event is over", () => {
    expect(getRegistrationState(event, new Date("2030-05-03T00:00:00Z"))).toMatchObject({ reason: "EVENT_ENDED" });
  });
});

describe("timezones", () => {
  it("converts wall-clock time in a zone to the right UTC instant, across DST", () => {
    expect(zonedLocalToUtc("2030-05-02T18:00", "America/Chicago")?.toISOString()).toBe("2030-05-02T23:00:00.000Z"); // CDT, UTC-5
    expect(zonedLocalToUtc("2030-01-15T18:00", "America/Chicago")?.toISOString()).toBe("2030-01-16T00:00:00.000Z"); // CST, UTC-6
  });
  it("round-trips back to the same wall clock", () => {
    const d = zonedLocalToUtc("2030-05-02T18:00", "America/Los_Angeles")!;
    expect(utcToZonedLocal(d, "America/Los_Angeles")).toBe("2030-05-02T18:00");
  });
  it("formats display strings in the event zone, not the server's", () => {
    const d = new Date("2030-05-02T23:00:00Z");
    expect(formatEventTime(d, "America/Chicago")).toMatch(/6:00\s?PM/);
    expect(formatEventDate(d, "America/Chicago")).toContain("May 2, 2030");
  });
  it("rejects garbage", () => {
    expect(zonedLocalToUtc("tomorrow", "America/Chicago")).toBeNull();
  });
});

describe("validateEventSettings", () => {
  it("accepts a minimal free event", () => {
    const r = validateEventSettings(base);
    expect(r.ok && r.data.priceCents).toBe(0);
    expect(r.ok && r.data.status).toBe("DRAFT");
  });
  it("needs a name and a start", () => {
    expect(validateEventSettings({ ...base, name: " " }).ok).toBe(false);
    expect(validateEventSettings({ ...base, startsAtLocal: "" }).ok).toBe(false);
  });
  it("rejects an end before the start and a close before the open", () => {
    expect(validateEventSettings({ ...base, endsAtLocal: "2030-05-02T10:00" }).ok).toBe(false);
    expect(validateEventSettings({ ...base, registrationOpensAtLocal: "2030-04-10T00:00", registrationClosesAtLocal: "2030-04-01T00:00" }).ok).toBe(false);
  });
  it("rejects a paid price under $1.00 and a benefit value above the price", () => {
    expect(validateEventSettings({ ...base, priceCents: 50 }).ok).toBe(false);
    expect(validateEventSettings({ ...base, priceCents: 5000, registrationFmvCents: 6000 }).ok).toBe(false);
  });
  it("forces one attendee when multiple attendees are off, and requires groups to be enabled to be required", () => {
    const r = validateEventSettings({ ...base, allowMultipleAttendees: false, maxAttendeesPerRegistration: 8, groupRequired: true, allowGroups: false });
    expect(r.ok && r.data.maxAttendeesPerRegistration).toBe(1);
    expect(r.ok && r.data.groupRequired).toBe(false);
  });
  it("defaults the group label generically", () => {
    const r = validateEventSettings({ ...base, allowGroups: true });
    expect(r.ok && r.data.groupLabel).toBe("Team / Group Name");
  });
  it("only accepts https or uploaded cover images", () => {
    expect(validateEventSettings({ ...base, coverImageUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(validateEventSettings({ ...base, coverImageUrl: "http://insecure.example/x.png" }).ok).toBe(false);
    expect(validateEventSettings({ ...base, coverImageUrl: "https://cdn.example/x.png" }).ok).toBe(true);
  });
});

describe("validateAddOns", () => {
  it("accepts well-formed add-ons", () => {
    const r = validateAddOns([{ name: "Raffle ticket", priceCents: 500, maxQuantity: 10 }]);
    expect(r.ok && r.addOns[0]).toMatchObject({ name: "Raffle ticket", priceCents: 500, maxQuantity: 10, isActive: true });
  });
  it("rejects missing names, sub-dollar prices and benefit value above price", () => {
    expect(validateAddOns([{ name: "", priceCents: 500 }]).ok).toBe(false);
    expect(validateAddOns([{ name: "x", priceCents: 50 }]).ok).toBe(false);
    expect(validateAddOns([{ name: "x", priceCents: 500, fmvCents: 900 }]).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("confirmation codes are 8 unambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(generateConfirmationCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });
  it("slugifies names safely", () => {
    expect(slugifyEventName("Spring Gala 2026!")).toBe("spring-gala-2026");
    expect(slugifyEventName("Café Día")).toBe("cafe-dia");
    expect(slugifyEventName("!!!")).toBe("event");
  });
});

describe("round 4 settings: payment methods, thank-you media, monthly gift", () => {
  const ok = (extra: Record<string, unknown>) => {
    const r = validateEventSettings({ ...base, ...extra });
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };

  it("defaults to all four ways to pay, and treats junk stored values the same way", () => {
    expect(ok({}).paymentMethods).toEqual(["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"]);
    for (const junk of [null, undefined, "CARD", [], ["BITCOIN"]]) expect(parseEventPaymentMethods(junk)).toEqual(["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"]);
    expect(parseEventPaymentMethods(["BANK", "CARD", "BITCOIN"])).toEqual(["CARD", "BANK"]);
  });

  it("keeps a chosen subset and refuses an empty choice", () => {
    expect(ok({ paymentMethods: ["CARD"] }).paymentMethods).toEqual(["CARD"]);
    const r = validateEventSettings({ ...base, paymentMethods: ["BITCOIN"] });
    expect(r.ok).toBe(false);
  });

  it("only allows a monthly gift when the optional donation is on", () => {
    expect(ok({ allowOptionalDonation: true, allowRecurringDonation: true }).allowRecurringDonation).toBe(true);
    expect(ok({ allowOptionalDonation: false, allowRecurringDonation: true }).allowRecurringDonation).toBe(false);
  });

  it("accepts supported thank-you video links and rejects others", () => {
    expect(ok({ confirmationVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }).confirmationVideoUrl).toContain("youtube");
    expect(ok({ confirmationVideoUrl: "https://cdn.example.com/clip.mp4" }).confirmationVideoUrl).toBe("https://cdn.example.com/clip.mp4");
    expect(validateEventSettings({ ...base, confirmationVideoUrl: "https://example.com/page" }).ok).toBe(false);
    expect(validateEventSettings({ ...base, confirmationVideoUrl: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("rejects an unsafe thank-you photo URL", () => {
    expect(validateEventSettings({ ...base, confirmationImageUrl: "http://insecure.example/a.jpg" }).ok).toBe(false);
    expect(validateEventSettings({ ...base, confirmationImageUrl: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("passes the organization name and header line through", () => {
    const d = ok({ hostName: "Riverbend", headerText: "Join us" });
    expect(d.hostName).toBe("Riverbend");
    expect(d.headerText).toBe("Join us");
  });
});
