import { describe, it, expect, vi, beforeEach } from "vitest";

const campaignFindMany = vi.fn();
const campaignUpdateMany = vi.fn();
const campaignCreate = vi.fn();
const recipientCreateMany = vi.fn();
const resolveAudience = vi.fn();
const sendChunk = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    givingCampaign: {
      findMany: (...a: unknown[]) => campaignFindMany(...a),
      updateMany: (...a: unknown[]) => campaignUpdateMany(...a),
      create: (...a: unknown[]) => campaignCreate(...a),
    },
    givingCampaignRecipient: { createMany: (...a: unknown[]) => recipientCreateMany(...a) },
  },
}));
vi.mock("@/lib/giving/campaignAudience", async (orig) => ({
  ...(await orig<typeof import("@/lib/giving/campaignAudience")>()),
  resolveCampaignAudience: (...a: unknown[]) => resolveAudience(...a),
}));
vi.mock("@/lib/giving/campaignSender", () => ({ sendCampaignChunk: (...a: unknown[]) => sendChunk(...a) }));

import { firstRunAt, nextRunAfter, parseAudienceRule, monthLabel, runDueSeries } from "@/lib/giving/campaignSeries";

describe("schedule math", () => {
  it("accepts a real date and rejects impossible ones", () => {
    expect(firstRunAt("2026-11-05")?.runAt.toISOString()).toBe("2026-11-05T12:00:00.000Z");
    expect(firstRunAt("2026-02-30")).toBeNull();
    expect(firstRunAt("tomorrow")).toBeNull();
    expect(firstRunAt("2026-11-5")).toBeNull();
  });

  it("repeats on the same day each month, never past the 28th, and rolls over the year", () => {
    expect(firstRunAt("2026-01-31")?.dayOfMonth).toBe(28);
    expect(nextRunAfter(new Date("2026-12-15T12:00:00Z"), 15).toISOString()).toBe("2027-01-15T12:00:00.000Z");
    expect(nextRunAfter(new Date("2027-01-28T12:00:00Z"), 31).toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });

  it("labels the month for each run's name", () => {
    expect(monthLabel(new Date("2026-03-01T12:00:00Z"))).toBe("March 2026");
  });
});

describe("parseAudienceRule", () => {
  it("accepts rule-based audiences and refuses a hand-picked list", () => {
    expect(parseAudienceRule({ source: "ALL_DONORS" })).toMatchObject({ source: "ALL_DONORS" });
    expect(parseAudienceRule({ source: "GIVING_PAGE", givingLinkId: "L1" })).toMatchObject({ givingLinkId: "L1" });
    expect(parseAudienceRule({ source: "SELECTED" })).toBeNull();
    expect(parseAudienceRule(null)).toBeNull();
    expect(parseAudienceRule({ source: "bogus" })).toBeNull();
  });
});

const NOW = new Date("2026-11-05T15:00:00Z");
const series = (over: Record<string, unknown> = {}) => ({
  id: "s1", churchId: "churchA", givingLinkId: "link1", name: "Capital campaign update", channel: "EMAIL", emailSubject: "Update", emailBodyTemplate: "Hi {{firstName}}",
  status: "SCHEDULED", nextRunAt: new Date("2026-11-05T12:00:00Z"), repeatDayOfMonth: 5, repeatEndsAt: null, repeatPausedAt: null, createdByUserId: "u1",
  fundraisingCampaignId: null, campaignTeamId: null, campaignFundraiserId: null, pledgeCampaignId: null, audienceJson: { source: "ALL_DONORS" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  campaignFindMany.mockReset();
  campaignUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  campaignCreate.mockReset().mockResolvedValue({ id: "child1" });
  recipientCreateMany.mockReset().mockResolvedValue({ count: 2 });
  resolveAudience.mockReset().mockResolvedValue({ ok: true, recipients: [{ donorId: "d1", email: "a@x.com", phone: null, name: "A" }, { donorId: "d2", email: "b@x.com", phone: null, name: "B" }] });
  sendChunk.mockReset().mockResolvedValue({ done: true, processed: 2, remaining: 0, sent: 2, failed: 0 });
});

function mockFinds(inFlight: unknown[], due: unknown[]) {
  campaignFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) => (args.where.status === "SCHEDULED" ? due : inFlight));
}

describe("runDueSeries", () => {
  it("claims the run first, creates this month's campaign for the current audience, and sends it", async () => {
    mockFinds([], [series()]);
    const summary = await runDueSeries(NOW);
    const claim = campaignUpdateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "s1", churchId: "churchA", nextRunAt: new Date("2026-11-05T12:00:00Z") });
    expect(claim.data.nextRunAt.toISOString()).toBe("2026-12-05T12:00:00.000Z");
    expect(resolveAudience).toHaveBeenCalledWith("churchA", { source: "ALL_DONORS", givingLinkId: undefined, eventId: undefined, eventScope: undefined }, "EMAIL");
    expect(campaignCreate.mock.calls[0][0].data).toMatchObject({ churchId: "churchA", parentCampaignId: "s1", name: "Capital campaign update — November 2026", channel: "EMAIL" });
    expect(recipientCreateMany.mock.calls[0][0].data).toHaveLength(2);
    expect(sendChunk).toHaveBeenCalledWith({ campaignId: "child1", churchId: "churchA", actorUserId: null });
    expect(summary).toMatchObject({ seriesDue: 1, campaignsCreated: 1, emailsSent: 2 });
  });

  it("does nothing when another invocation already claimed the run (no double send)", async () => {
    mockFinds([], [series()]);
    campaignUpdateMany.mockResolvedValue({ count: 0 });
    const summary = await runDueSeries(NOW);
    expect(campaignCreate).not.toHaveBeenCalled();
    expect(sendChunk).not.toHaveBeenCalled();
    expect(summary.campaignsCreated).toBe(0);
  });

  it("skips (but still advances) a month with nobody to send to", async () => {
    mockFinds([], [series()]);
    resolveAudience.mockResolvedValue({ ok: true, recipients: [] });
    const summary = await runDueSeries(NOW);
    expect(campaignCreate).not.toHaveBeenCalled();
    expect(summary.skippedEmptyAudience).toBe(1);
    expect(campaignUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("ends a series whose end date has passed instead of sending", async () => {
    mockFinds([], [series({ repeatEndsAt: new Date("2026-10-31T12:00:00Z") })]);
    await runDueSeries(NOW);
    expect(campaignUpdateMany.mock.calls[0][0].data).toMatchObject({ status: "ENDED", nextRunAt: null });
    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it("only asks for series that are due and not paused, and finishes unfinished monthly sends first", async () => {
    mockFinds([{ id: "unfinished", churchId: "churchB" }], []);
    sendChunk.mockResolvedValue({ done: true, processed: 1, remaining: 0, sent: 1, failed: 0 });
    const summary = await runDueSeries(NOW);
    expect(sendChunk).toHaveBeenCalledWith({ campaignId: "unfinished", churchId: "churchB", actorUserId: null });
    expect(summary.resumed).toBe(1);
    const dueQuery = campaignFindMany.mock.calls.find((c) => c[0].where.status === "SCHEDULED")![0];
    expect(dueQuery.where).toMatchObject({ repeatPausedAt: null, repeatInterval: "MONTHLY", nextRunAt: { lte: NOW } });
  });

  it("ignores a series whose stored audience isn't a valid rule", async () => {
    mockFinds([], [series({ audienceJson: { source: "SELECTED" } })]);
    const summary = await runDueSeries(NOW);
    expect(campaignCreate).not.toHaveBeenCalled();
    expect(summary.skippedEmptyAudience).toBe(1);
  });
});
