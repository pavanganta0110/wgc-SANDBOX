import { describe, it, expect, vi, beforeEach } from "vitest";

const eventFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { event: { findFirst: (...a: unknown[]) => eventFindFirst(...a) } } }));

import { loadCampaignEventVars } from "@/lib/giving/campaignEventVars";

beforeEach(() => eventFindFirst.mockReset());

describe("loadCampaignEventVars", () => {
  it("is scoped to the church and skips archived events", async () => {
    eventFindFirst.mockResolvedValue(null);
    expect(await loadCampaignEventVars("churchA", "ev1")).toBeNull();
    expect(eventFindFirst.mock.calls[0][0].where).toEqual({ id: "ev1", churchId: "churchA", archivedAt: null });
  });

  it("formats date/time in the event's zone and joins the location", async () => {
    eventFindFirst.mockResolvedValue({
      slug: "gala", status: "ACTIVE", name: "Spring Gala", startsAt: new Date("2030-05-02T23:00:00Z"),
      timezone: "America/Chicago", locationName: "Main Hall", locationAddress: "1 Church St",
    });
    const v = await loadCampaignEventVars("churchA", "ev1");
    expect(v).toMatchObject({ slug: "gala", status: "ACTIVE", eventName: "Spring Gala", eventLocation: "Main Hall, 1 Church St" });
    expect(v?.eventDate).toContain("May 2, 2030");
    expect(v?.eventTime).toMatch(/6:00\s?PM/);
  });

  it("falls back when there is no location", async () => {
    eventFindFirst.mockResolvedValue({ slug: "g", status: "DRAFT", name: "G", startsAt: new Date(), timezone: "America/Chicago", locationName: null, locationAddress: null });
    expect((await loadCampaignEventVars("churchA", "ev1"))?.eventLocation).toBe("the event location");
  });
});
