import { describe, it, expect, afterEach } from "vitest";
import { buildPreviewEvent, buildPreviewAddOns, type PreviewFormValues } from "@/lib/eventRegistration/previewData";
import { appOrigin, publicEventUrl } from "@/lib/eventRegistration/eventConfig";

const blank: PreviewFormValues = {
  name: "", description: "", coverImageUrl: "", timezone: "America/Chicago", startsAtLocal: "", locationName: "", locationAddress: "",
  priceMode: "PER_ATTENDEE", allowOptionalDonation: false, donationPrompt: "", allowMultipleAttendees: true, maxAttendeesPerRegistration: 10,
  attendeeEmailRequired: false, collectAttendeePhone: false, registrantPhoneRequired: false, allowGroups: false, groupLabel: "", groupRequired: false,
  mailingAddressMode: "HIDDEN", confirmationMessage: "", customFields: [],
};

describe("buildPreviewEvent (live preview of an unfinished event)", () => {
  it("never throws on an empty form and shows placeholders", () => {
    const e = buildPreviewEvent(blank, 0);
    expect(e.name).toBe("Your event name");
    expect(e.dateLabel).toBe("Date to be announced");
    expect(e.timeLabel).toBe("");
    expect(e.groupLabel).toBe("Team / Group Name");
    expect(e.priceCents).toBe(0);
  });

  it("formats the entered date and time in the chosen zone", () => {
    const e = buildPreviewEvent({ ...blank, name: "Gala", startsAtLocal: "2030-05-02T18:00" }, 5000);
    expect(e.dateLabel).toContain("May 2, 2030");
    expect(e.timeLabel).toMatch(/6:00\s?PM/);
    expect(e.priceCents).toBe(5000);
  });

  it("hides questions that aren't finished (no label, or a dropdown with no options) and assigns ids to new ones", () => {
    const e = buildPreviewEvent(
      {
        ...blank,
        customFields: [
          { id: "", label: "Shirt size", type: "DROPDOWN", required: true, appliesTo: "ATTENDEE", options: ["S", "M"] },
          { id: "", label: "", type: "TEXT", required: false, appliesTo: "ATTENDEE" },
          { id: "", label: "Meal", type: "DROPDOWN", required: false, appliesTo: "ATTENDEE", options: [] },
        ],
      },
      0
    );
    expect(e.customFields).toHaveLength(1);
    expect(e.customFields[0].id).toBeTruthy();
  });

  it("allows one attendee when multiple are off, and only makes a group required when groups are on", () => {
    const e = buildPreviewEvent({ ...blank, allowMultipleAttendees: false, maxAttendeesPerRegistration: 8, allowGroups: false, groupRequired: true }, 0);
    expect(e.maxAttendeesPerRegistration).toBe(1);
    expect(e.groupRequired).toBe(false);
  });
});

describe("buildPreviewAddOns", () => {
  it("shows only active, named, priced add-ons, with sane quantities", () => {
    const out = buildPreviewAddOns([
      { name: "Raffle", description: "", priceCents: 500, maxQuantity: 0, isActive: true },
      { name: "", description: "", priceCents: 500, maxQuantity: 1, isActive: true },
      { name: "Free thing", description: "", priceCents: 0, maxQuantity: 1, isActive: true },
      { name: "Hidden", description: "", priceCents: 500, maxQuantity: 1, isActive: false },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Raffle", maxQuantity: 1 });
  });
});

describe("appOrigin / publicEventUrl", () => {
  const saved = { app: process.env.NEXT_PUBLIC_APP_URL, site: process.env.NEXT_PUBLIC_SITE_URL };
  afterEach(() => {
    for (const [k, v] of [["NEXT_PUBLIC_APP_URL", saved.app], ["NEXT_PUBLIC_SITE_URL", saved.site]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("uses each environment's own origin so sandbox embeds point at sandbox", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://sandbox.example.com/";
    expect(appOrigin()).toBe("https://sandbox.example.com");
    expect(publicEventUrl("gala-1")).toBe("https://sandbox.example.com/event/gala-1");
  });

  it("always uses the canonical domain for production and when nothing is configured", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://wgcpayments.com";
    expect(appOrigin()).toBe("https://www.wgcpayments.com");
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(appOrigin()).toBe("https://www.wgcpayments.com");
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    expect(appOrigin()).toBe("https://www.wgcpayments.com");
  });
});
