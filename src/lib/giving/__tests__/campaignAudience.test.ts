import { describe, it, expect, vi, beforeEach } from "vitest";

const donorFindMany = vi.fn();
const paymentFindMany = vi.fn();
const linkFindFirst = vi.fn();
const eventFindFirst = vi.fn();
const loadEventAudience = vi.fn();
const optOutFindMany = vi.fn();
const externalFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    donor: { findMany: (...a: unknown[]) => donorFindMany(...a) },
    payment: { findMany: (...a: unknown[]) => paymentFindMany(...a) },
    givingLink: { findFirst: (...a: unknown[]) => linkFindFirst(...a) },
    event: { findFirst: (...a: unknown[]) => eventFindFirst(...a) },
    emailOptOut: { findMany: (...a: unknown[]) => optOutFindMany(...a) },
    externalDonation: { findMany: (...a: unknown[]) => externalFindMany(...a) },
  },
}));
vi.mock("@/lib/eventRegistration/audience", async (orig) => ({
  ...(await orig<typeof import("@/lib/eventRegistration/audience")>()),
  loadEventAudience: (...a: unknown[]) => loadEventAudience(...a),
}));

import { resolveCampaignAudience } from "@/lib/giving/campaignAudience";

const donor = (id: string, email: string | null, extra: Record<string, unknown> = {}) => ({ id, name: `Donor ${id}`, email, normalizedEmail: email?.toLowerCase() ?? null, normalizedPhone: null, ...extra });

beforeEach(() => {
  [donorFindMany, paymentFindMany, linkFindFirst, eventFindFirst, loadEventAudience, optOutFindMany, externalFindMany].forEach((m) => m.mockReset());
  optOutFindMany.mockResolvedValue([]);
  externalFindMany.mockResolvedValue([]);
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
  it("is everyone who has actually given — online or a recorded external gift — and nobody else", async () => {
    paymentFindMany.mockResolvedValue([{ donorId: "1" }, { donorId: "9" }]);
    externalFindMany.mockResolvedValue([{ donorId: "9" }, { donorId: "5" }]);
    donorFindMany.mockResolvedValue([donor("1", "a@x.com"), donor("5", "c@x.com"), donor("9", "b@x.com")]);
    const r = await resolveCampaignAudience("churchA", { source: "ALL_DONORS" }, "EMAIL");
    expect(r.ok && r.recipients.map((x) => x.donorId).sort()).toEqual(["1", "5", "9"]);
    expect(paymentFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", status: "SUCCEEDED" });
    expect(externalFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA" });
    expect(donorFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", id: { in: ["1", "9", "5"] } });
  });

  it("is empty (and doesn't query donors) when nobody has given yet", async () => {
    paymentFindMany.mockResolvedValue([]);
    const r = await resolveCampaignAudience("churchA", { source: "ALL_DONORS" }, "EMAIL");
    expect(r.ok && r.recipients).toEqual([]);
    expect(donorFindMany).not.toHaveBeenCalled();
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

describe("NOT_GIVEN (people who haven't given yet)", () => {
  it("is everyone on file with an email except donors with a successful payment or a recorded external gift", async () => {
    paymentFindMany.mockResolvedValue([{ donorId: "gave-online" }]);
    externalFindMany.mockResolvedValue([{ donorId: "gave-by-check" }]);
    donorFindMany.mockResolvedValue([donor("gave-online", "a@x.com"), donor("gave-by-check", "b@x.com"), donor("registrant", "c@x.com"), donor("imported", "d@x.com")]);
    const r = await resolveCampaignAudience("churchA", { source: "NOT_GIVEN" }, "EMAIL");
    expect(r.ok && r.recipients.map((x) => x.donorId)).toEqual(["registrant", "imported"]);
    expect(paymentFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", status: "SUCCEEDED" });
    expect(externalFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA" });
    expect(donorFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA" });
  });
});

describe("unsubscribed addresses", () => {
  it("are removed from every email audience, case-insensitively", async () => {
    donorFindMany.mockResolvedValue([donor("1", "keep@x.com"), donor("2", "Gone@X.com")]);
    optOutFindMany.mockResolvedValue([{ normalizedEmail: "gone@x.com" }]);
    const r = await resolveCampaignAudience("churchA", { source: "SELECTED", donorIds: ["1", "2"] }, "EMAIL");
    expect(r.ok && r.recipients.map((x) => x.donorId)).toEqual(["1"]);
    expect(optOutFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA" });
  });

  it("do not affect texts", async () => {
    donorFindMany.mockResolvedValue([{ id: "1", name: "A", email: "gone@x.com", normalizedEmail: "gone@x.com", normalizedPhone: "+15555550101" }]);
    optOutFindMany.mockResolvedValue([{ normalizedEmail: "gone@x.com" }]);
    const r = await resolveCampaignAudience("churchA", { source: "SELECTED", donorIds: ["1"] }, "TEXT");
    expect(r.ok && r.recipients).toHaveLength(1);
    expect(optOutFindMany).not.toHaveBeenCalled();
  });
});
