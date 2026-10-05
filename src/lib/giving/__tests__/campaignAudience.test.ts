import { describe, it, expect, vi, beforeEach } from "vitest";

const donorFindMany = vi.fn();
const paymentFindMany = vi.fn();
const linkFindFirst = vi.fn();
const eventFindFirst = vi.fn();
const loadEventAudience = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    donor: { findMany: (...a: unknown[]) => donorFindMany(...a) },
    payment: { findMany: (...a: unknown[]) => paymentFindMany(...a) },
    givingLink: { findFirst: (...a: unknown[]) => linkFindFirst(...a) },
    event: { findFirst: (...a: unknown[]) => eventFindFirst(...a) },
  },
}));
vi.mock("@/lib/eventRegistration/audience", async (orig) => ({
  ...(await orig<typeof import("@/lib/eventRegistration/audience")>()),
  loadEventAudience: (...a: unknown[]) => loadEventAudience(...a),
}));

import { resolveCampaignAudience } from "@/lib/giving/campaignAudience";

const donor = (id: string, email: string | null, extra: Record<string, unknown> = {}) => ({ id, name: `Donor ${id}`, email, normalizedEmail: email?.toLowerCase() ?? null, normalizedPhone: null, ...extra });

beforeEach(() => {
  [donorFindMany, paymentFindMany, linkFindFirst, eventFindFirst, loadEventAudience].forEach((m) => m.mockReset());
});

describe("SELECTED", () => {
  it("only reaches the church's own donors, and drops duplicates and invalid emails", async () => {
    donorFindMany.mockResolvedValue([donor("1", "a@x.com"), donor("2", "A@x.com"), donor("3", "bad")]);
    const r = await resolveCampaignAudience("churchA", { source: "SELECTED", donorIds: ["1", "2", "3"] }, "EMAIL");
    expect(donorFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", id: { in: ["1", "2", "3"] } });
    expect(r.ok && r.recipients.map((x) => x.donorId)).toEqual(["1"]);
  });

  it("requires at least one donor", async () => {
    expect((await resolveCampaignAudience("churchA", { source: "SELECTED", donorIds: [] }, "EMAIL")).ok).toBe(false);
  });
});

describe("ALL_DONORS", () => {
  it("includes ordinary donors plus imported/event contacts who have actually paid, de-duplicated", async () => {
    donorFindMany
      .mockResolvedValueOnce([donor("1", "a@x.com")]) // contactSource null
      .mockResolvedValueOnce([donor("9", "b@x.com")]); // paid contact
    paymentFindMany.mockResolvedValue([{ donorId: "1" }, { donorId: "9" }]);
    const r = await resolveCampaignAudience("churchA", { source: "ALL_DONORS" }, "EMAIL");
    expect(r.ok && r.recipients.map((x) => x.donorId).sort()).toEqual(["1", "9"]);
    expect(donorFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", contactSource: null });
    expect(paymentFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", status: "SUCCEEDED" });
    expect(donorFindMany.mock.calls[1][0].where).toMatchObject({ churchId: "churchA", id: { in: ["9"] } });
  });
});

describe("GIVING_PAGE", () => {
  it("rejects a giving page that isn't this church's", async () => {
    linkFindFirst.mockResolvedValue(null);
    const r = await resolveCampaignAudience("churchA", { source: "GIVING_PAGE", givingLinkId: "linkOfChurchB" }, "EMAIL");
    expect(linkFindFirst).toHaveBeenCalledWith({ where: { id: "linkOfChurchB", churchId: "churchA" }, select: { id: true } });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("returns the donors who completed a payment through that page", async () => {
    linkFindFirst.mockResolvedValue({ id: "L1" });
    paymentFindMany.mockResolvedValue([{ donorId: "5" }]);
    donorFindMany.mockResolvedValue([donor("5", "e@x.com")]);
    const r = await resolveCampaignAudience("churchA", { source: "GIVING_PAGE", givingLinkId: "L1" }, "EMAIL");
    expect(paymentFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", givingLinkId: "L1", status: "SUCCEEDED" });
    expect(r.ok && r.recipients).toHaveLength(1);
  });
});

describe("IMPORTED_CONTACTS", () => {
  it("targets only CSV-imported contacts, with no donation required", async () => {
    donorFindMany.mockResolvedValue([donor("7", "imp@x.com")]);
    const r = await resolveCampaignAudience("churchA", { source: "IMPORTED_CONTACTS" }, "EMAIL");
    expect(donorFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", contactSource: "CSV_IMPORT" });
    expect(paymentFindMany).not.toHaveBeenCalled();
    expect(r.ok && r.recipients[0].email).toBe("imp@x.com");
  });
});

describe("EVENT", () => {
  it("rejects an event that isn't this church's", async () => {
    eventFindFirst.mockResolvedValue(null);
    const r = await resolveCampaignAudience("churchA", { source: "EVENT", eventId: "eventOfChurchB" }, "EMAIL");
    expect(eventFindFirst).toHaveBeenCalledWith({ where: { id: "eventOfChurchB", churchId: "churchA" }, select: { id: true } });
    expect(loadEventAudience).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("passes the scope through and emails people who never paid (no donor needed)", async () => {
    eventFindFirst.mockResolvedValue({ id: "E1" });
    loadEventAudience.mockResolvedValue([{ email: "guest@x.com", normalizedEmail: "guest@x.com", name: "Guest", firstName: "Guest", donorId: null, registrationId: "r1" }]);
    const r = await resolveCampaignAudience("churchA", { source: "EVENT", eventId: "E1", eventScope: "CHECKED_IN" }, "EMAIL");
    expect(loadEventAudience).toHaveBeenCalledWith("churchA", "E1", "CHECKED_IN");
    expect(r.ok && r.recipients).toEqual([{ donorId: null, email: "guest@x.com", phone: null, name: "Guest" }]);
  });

  it("falls back to all attendees for an unknown scope and can't be texted", async () => {
    eventFindFirst.mockResolvedValue({ id: "E1" });
    loadEventAudience.mockResolvedValue([]);
    await resolveCampaignAudience("churchA", { source: "EVENT", eventId: "E1", eventScope: "bogus" }, "EMAIL");
    expect(loadEventAudience).toHaveBeenCalledWith("churchA", "E1", "ALL_ATTENDEES");
    expect((await resolveCampaignAudience("churchA", { source: "EVENT", eventId: "E1" }, "TEXT")).ok).toBe(false);
  });
});
