import { describe, it, expect } from "vitest";
import { findDueBroadcasts } from "@/lib/eventRegistration/eventBroadcast";
import { deriveEventLinkSettings } from "@/lib/eventRegistration/eventGivingLink";

const DAY = 24 * 60 * 60 * 1000;
const starts = new Date("2030-05-10T18:00:00Z");

function ev(over: Record<string, unknown> = {}) {
  return {
    id: "e1",
    churchId: "c1",
    startsAt: starts,
    endsAt: null,
    emailTemplatesJson: { reminder: { enabled: true, daysBefore: 3 }, thankYou: { enabled: true, daysAfter: 1 } },
    reminderSentAt: null,
    thankYouSentAt: null,
    ...over,
  } as Parameters<typeof findDueBroadcasts>[0][number];
}

describe("findDueBroadcasts", () => {
  it("sends the reminder once the configured number of days before has arrived", () => {
    expect(findDueBroadcasts([ev()], new Date(starts.getTime() - 4 * DAY))).toEqual([]);
    expect(findDueBroadcasts([ev()], new Date(starts.getTime() - 3 * DAY + 1000))).toEqual([{ id: "e1", churchId: "c1", kind: "reminder" }]);
  });

  it("does not remind about an event that has already started", () => {
    expect(findDueBroadcasts([ev()], new Date(starts.getTime() + 1000))).toEqual([]);
  });

  it("sends the thank-you the configured days after the event ends, not before", () => {
    expect(findDueBroadcasts([ev()], new Date(starts.getTime() + 0.5 * DAY))).toEqual([]);
    expect(findDueBroadcasts([ev()], new Date(starts.getTime() + 1.1 * DAY))).toEqual([{ id: "e1", churchId: "c1", kind: "thankYou" }]);
  });

  it("uses the end time for the thank-you when there is one", () => {
    const e = ev({ endsAt: new Date(starts.getTime() + 2 * DAY) });
    expect(findDueBroadcasts([e], new Date(starts.getTime() + 2.5 * DAY))).toEqual([]);
    expect(findDueBroadcasts([e], new Date(starts.getTime() + 3.1 * DAY))).toHaveLength(1);
  });

  it("never re-sends something already sent", () => {
    const e = ev({ reminderSentAt: new Date(), thankYouSentAt: new Date() });
    expect(findDueBroadcasts([e], new Date(starts.getTime() - 2 * DAY))).toEqual([]);
    expect(findDueBroadcasts([e], new Date(starts.getTime() + 2 * DAY))).toEqual([]);
  });

  it("skips disabled emails and stale thank-yous", () => {
    expect(findDueBroadcasts([ev({ emailTemplatesJson: null })], new Date(starts.getTime() - 2 * DAY))).toEqual([]);
    expect(findDueBroadcasts([ev()], new Date(starts.getTime() + 60 * DAY))).toEqual([]);
  });
});

describe("deriveEventLinkSettings", () => {
  const src = { name: "Spring Event", status: "ACTIVE", mailingAddressMode: "REQUIRED", registrantPhoneRequired: true };

  it("makes the dedicated link's required fields follow the event", () => {
    const s = deriveEventLinkSettings(src);
    expect(s.donorFieldSettingsJson).toMatchObject({ phone: "REQUIRED", street: "REQUIRED", city: "REQUIRED", postalCode: "REQUIRED" });
    expect(s.collectMailingAddress).toBe(true);
  });
  it("hides address fields when the event does not ask for one", () => {
    const s = deriveEventLinkSettings({ ...src, mailingAddressMode: "HIDDEN", registrantPhoneRequired: false });
    expect(s.donorFieldSettingsJson).toMatchObject({ phone: "OPTIONAL", street: "HIDDEN" });
    expect(s.collectMailingAddress).toBe(false);
  });
  it("deactivates the link whenever the event is not ACTIVE", () => {
    expect(deriveEventLinkSettings(src).status).toBe("ACTIVE");
    expect(deriveEventLinkSettings({ ...src, status: "DRAFT" }).status).toBe("INACTIVE");
    expect(deriveEventLinkSettings({ ...src, status: "ARCHIVED" }).status).toBe("ARCHIVED");
  });
});

describe("event checkout link payment methods", () => {
  it("offers Apple Pay and Google Pay alongside card and bank (the page still hides wallets the organization hasn't enabled)", async () => {
    const { EVENT_LINK_PAYMENT_METHODS } = await import("@/lib/eventRegistration/eventGivingLink");
    expect(EVENT_LINK_PAYMENT_METHODS).toEqual(["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"]);
    expect(deriveEventLinkSettings({ name: "x", status: "ACTIVE", mailingAddressMode: "HIDDEN", registrantPhoneRequired: false }).allowedPaymentMethodsJson).toEqual(EVENT_LINK_PAYMENT_METHODS);
  });
});
