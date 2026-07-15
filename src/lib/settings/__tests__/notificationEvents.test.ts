import { describe, it, expect } from "vitest";
import { NOTIFICATION_EVENTS, DEFAULT_NOTIFICATION_PREFERENCE } from "@/lib/settings/notificationEvents";

describe("NOTIFICATION_EVENTS", () => {
  it("has a unique key for every event", () => {
    const keys = NOTIFICATION_EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every event has a non-empty label and description", () => {
    for (const event of NOTIFICATION_EVENTS) {
      expect(event.label.length).toBeGreaterThan(0);
      expect(event.description.length).toBeGreaterThan(0);
    }
  });
});

describe("DEFAULT_NOTIFICATION_PREFERENCE", () => {
  it("defaults to immediate email and in-app delivery", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCE).toEqual({ inAppEnabled: true, emailEnabled: true, frequency: "IMMEDIATE" });
  });
});
