import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  donor: { findMany: vi.fn() },
  finixSettlement: { findMany: vi.fn() },
  givingLink: { findMany: vi.fn() },
  fundraisingCampaign: { findMany: vi.fn() },
  finixSubscription: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/campaigns/campaignTotals", () => ({ getCampaignRaisedCents: vi.fn(async (churchId: string) => (churchId === "c1" ? 5000 : 0)) }));
const orgs = vi.hoisted(() => ({ loadPartnerApiOrganizations: vi.fn() }));
vi.mock("@/lib/partners/loadPartnerApiOrganizations", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/partners/loadPartnerApiOrganizations")>()), loadPartnerApiOrganizations: orgs.loadPartnerApiOrganizations }));
// The key check is covered by partnerApiAuth.test.ts; here the handler runs as partner p1.
vi.mock("@/lib/partners/partnerApiAuth", () => ({
  withPartnerApiAuth: (handler: (req: Request, auth: { partnerKeyId: string; partnerId: string }, requestId: string) => Promise<Response>) => async (req: Request) =>
    handler(req, { partnerKeyId: "k1", partnerId: "p1" }, "req_1"),
}));

import { GET as donors } from "../donors/route";
import { GET as settlements } from "../settlements/route";
import { GET as givingLinks } from "../giving-links/route";
import { GET as campaigns } from "../campaigns/route";
import { GET as recurring } from "../recurring/route";

const mine = [
  { id: "c1", name: "Grace", reference: "loc_1" },
  { id: "c2", name: "Hope", reference: null },
];
const get = (handler: (r: Request) => Promise<Response>, query = "") => handler(new Request(`https://wgc.test/api/v1/partner/x${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  orgs.loadPartnerApiOrganizations.mockResolvedValue(mine);
  for (const model of Object.values(prismaMock)) model.findMany.mockResolvedValue([]);
});

describe("every partner list endpoint reads only the partner's organizations", () => {
  const cases: [string, (r: Request) => Promise<Response>, { findMany: ReturnType<typeof vi.fn> }][] = [
    ["donors", donors, prismaMock.donor],
    ["settlements", settlements, prismaMock.finixSettlement],
    ["giving-links", givingLinks, prismaMock.givingLink],
    ["campaigns", campaigns, prismaMock.fundraisingCampaign],
    ["recurring", recurring, prismaMock.finixSubscription],
  ];

  for (const [name, handler, model] of cases) {
    it(`${name}: filters by the key's organizations and by a single one when asked`, async () => {
      await get(handler, "?churchId=other&partnerId=p2");
      expect(model.findMany.mock.calls[0][0].where.churchId).toEqual({ in: ["c1", "c2"] });

      await get(handler, "?organization=loc_1");
      expect(model.findMany.mock.calls[1][0].where.churchId).toEqual({ in: ["c1"] });

      expect((await get(handler, "?organization=not-mine")).status).toBe(404);
      expect(model.findMany).toHaveBeenCalledTimes(2);
    });
  }
});

describe("what each endpoint returns", () => {
  it("donors: the organization API's fields plus the organization, without churchId", async () => {
    prismaMock.donor.findMany.mockResolvedValue([{ id: "d1", churchId: "c2", name: "Ann", email: "a@x.test", phone: null, anonymousPreference: false, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02") }]);
    const body = await (await get(donors)).json();
    expect(body.data[0]).toMatchObject({ id: "d1", name: "Ann", organization: { id: "c2", name: "Hope", reference: null } });
    expect(JSON.stringify(body)).not.toContain("churchId");
  });

  it("campaigns: the amount raised is read inside each campaign's own organization", async () => {
    prismaMock.fundraisingCampaign.findMany.mockResolvedValue([
      { id: "k1", churchId: "c1", name: "Building", description: null, slug: "b", status: "ACTIVE", goalAmountCents: 10000, startDate: null, endDate: null, createdAt: new Date() },
      { id: "k2", churchId: "c2", name: "Youth", description: null, slug: "y", status: "ACTIVE", goalAmountCents: null, startDate: null, endDate: null, createdAt: new Date() },
    ]);
    const body = await (await get(campaigns)).json();
    expect(body.data.map((c: { id: string; raisedCents: number }) => [c.id, c.raisedCents])).toEqual([["k1", 5000], ["k2", 0]]);
  });

  it("giving links: net collected after refunds and returns", async () => {
    prismaMock.givingLink.findMany.mockResolvedValue([{ id: "g1", churchId: "c1", publicSlug: "abc", internalName: "Main", publicTitle: "Give", status: "ACTIVE", totalCollectedCents: 10000, refundedCents: 1500, returnedCents: 500, successfulDonations: 9, createdAt: new Date() }]);
    const body = await (await get(givingLinks)).json();
    expect(body.data[0]).toMatchObject({ id: "g1", netCollectedCents: 8000, successfulDonations: 9, organization: { name: "Grace" } });
    expect(body.data[0].url).toContain("/g/abc");
  });

  it("recurring: status, interval, next charge and the last failure", async () => {
    const base = { churchId: "c1", donorId: "d1", fundId: null, fundName: "General", givingLinkId: "g1", amountCents: 5300, donationAmountCents: 5000, donorCoversFee: true, currency: "USD", billingInterval: "MONTHLY", completedAt: null, retryCount: null };
    prismaMock.finixSubscription.findMany.mockResolvedValue([
      { ...base, id: "s1", state: "ACTIVE", nextBillingDate: new Date("2026-12-01T00:00:00Z"), startedAt: new Date("2026-01-01"), canceledAt: null, cancelReason: null, failureCode: null, failureMessage: null },
      { ...base, id: "s2", state: "PAST_DUE", nextBillingDate: new Date("2026-12-05T00:00:00Z"), startedAt: new Date("2026-02-01"), canceledAt: null, cancelReason: null, failureCode: "INSUFFICIENT_FUNDS", failureMessage: "Declined", retryCount: 2 },
      { ...base, id: "s3", state: "ACTIVE", nextBillingDate: null, startedAt: new Date("2026-03-01"), canceledAt: new Date("2026-06-01"), cancelReason: "donor request", failureCode: null, failureMessage: null },
    ]);
    const body = await (await get(recurring)).json();
    expect(body.data.map((s: { id: string; status: string }) => [s.id, s.status])).toEqual([["s1", "ACTIVE"], ["s2", "PAST_DUE"], ["s3", "CANCELED"]]);
    expect(body.data[0]).toMatchObject({ interval: "MONTHLY", giftCents: 5000, chargedCents: 5300, feeCovered: true, nextChargeAt: "2026-12-01T00:00:00.000Z", lastFailure: null });
    expect(body.data[1].lastFailure).toEqual({ code: "INSUFFICIENT_FUNDS", message: "Declined", retryCount: 2 });
    expect(body.data[2]).toMatchObject({ cancelReason: "donor request" });
    expect(JSON.stringify(body)).not.toContain("churchId");

    const onlyPastDue = await (await get(recurring, "?status=past_due")).json();
    expect(onlyPastDue.data.map((s: { id: string }) => s.id)).toEqual(["s2"]);
  });
});
