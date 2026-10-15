/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { payments: [] as Row[], subs: [] as Row[], refunds: [] as Row[], returns: [] as Row[] };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findMany: async ({ where }: any) => db.payments.filter((p) => where.donorId.in.includes(p.donorId) && where.status.in.includes(p.status) && p.isAnonymous === false && p.goodsServicesProvided === false) },
    finixSubscription: { findMany: async ({ where }: any) => db.subs.filter((s) => where.donorId.in.includes(s.donorId)) },
    finixRefundOrReversal: { findMany: async ({ where }: any) => db.refunds.filter((r) => where.finixOriginalTransferId.in.includes(r.finixOriginalTransferId)) },
    bankReturn: { findMany: async ({ where }: any) => db.returns.filter((r) => where.originalTransferId.in.includes(r.originalTransferId)) },
  },
}));

import { buildDonorSummaries, describeSummary, digestOf, profileFieldValues, summarizeGifts } from "../profileSummary";

const NOW = new Date("2026-10-14T12:00:00Z");
const gift = (net: number, iso: string, fund: string | null = "General") => ({ netCents: net, createdAt: new Date(iso), fundName: fund });

describe("summarizeGifts", () => {
  it("adds up this year, last year and lifetime, and finds the first and last gift", () => {
    const s = summarizeGifts([gift(10000, "2026-03-01"), gift(5000, "2026-09-01"), gift(7000, "2025-05-05"), gift(2000, "2023-01-01")], "No", NOW);
    expect(s).toMatchObject({ givenThisYearCents: 15000, givenLastYearCents: 7000, lifetimeCents: 24000, giftCount: 4, firstGiftOn: "2023-01-01", lastGiftOn: "2026-09-01", lastGiftCents: 5000 });
  });

  it("ignores gifts that were taken back in full, and a donor with no gifts has an empty summary", () => {
    expect(summarizeGifts([gift(0, "2026-03-01")], "No", NOW)).toMatchObject({ giftCount: 0, lifetimeCents: 0, lastGiftOn: null, lastGiftCents: null, mainFund: null });
    expect(summarizeGifts([], "No", NOW).giftCount).toBe(0);
  });

  it("the main fund is where the most money went, and a tie never flips between runs", () => {
    expect(summarizeGifts([gift(100, "2026-01-01", "Missions"), gift(900, "2026-01-02", "Building")], "No", NOW).mainFund).toBe("Building");
    expect(summarizeGifts([gift(500, "2026-01-01", "Missions"), gift(500, "2026-01-02", "Building")], "No", NOW).mainFund).toBe("Building");
  });

  it("uses the year the gift was made, in UTC, around New Year", () => {
    const s = summarizeGifts([gift(100, "2025-12-31T23:59:59Z"), gift(200, "2026-01-01T00:00:00Z")], "No", NOW);
    expect(s).toMatchObject({ givenLastYearCents: 100, givenThisYearCents: 200 });
  });
});

describe("what is written", () => {
  const summary = summarizeGifts([gift(123456, "2026-03-01")], "Yes — $200.00 Monthly", NOW);

  it("money is dollars with cents so it can be filtered as a number; nothing to show is null (never written)", () => {
    const v = profileFieldValues(summary, "https://x/donors/d1");
    expect(v).toMatchObject({ given_this_year: "1234.56", lifetime_total: "1234.56", given_last_year: "0.00", gift_count: "1", last_gift: "2026-03-01", last_gift_amount: "1234.56", recurring: "Yes — $200.00 Monthly", main_fund: "General", wgc_link: "https://x/donors/d1" });
    expect(profileFieldValues(summarizeGifts([], "No", NOW), "u").last_gift_amount).toBeNull();
    expect(profileFieldValues(summarizeGifts([], "No", NOW), "u").first_gift).toBeNull();
  });

  it("the fingerprint changes when anything shown changes and not otherwise", () => {
    const a = digestOf(profileFieldValues(summary, "u"));
    expect(digestOf(profileFieldValues(summary, "u"))).toBe(a);
    expect(digestOf(profileFieldValues({ ...summary, giftCount: 2 }, "u"))).not.toBe(a);
  });

  it("reads naturally in the preview", () => {
    const rows = describeSummary(summary);
    expect(rows.find((r) => r.label === "Given this year")?.value).toBe("$1,234.56");
    expect(rows.find((r) => r.label === "Last gift")?.value).toBe("2026-03-01");
  });
});

describe("buildDonorSummaries", () => {
  const pay = (id: string, over: Row = {}) => ({ id, donorId: "d1", status: "SUCCEEDED", isAnonymous: false, goodsServicesProvided: false, amountCents: 10000, donationAmountCents: null, createdAt: new Date("2026-05-01"), fundName: "General", finixTransferId: `t-${id}`, ...over });
  beforeEach(() => Object.assign(db, { payments: [], subs: [], refunds: [], returns: [] }));

  it("counts the gift without a donor-covered fee", async () => {
    db.payments = [pay("p1", { amountCents: 10320, donationAmountCents: 10000 })];
    expect((await buildDonorSummaries("c1", ["d1"], NOW)).get("d1")!.lifetimeCents).toBe(10000);
  });

  it("a full refund takes the gift out; a partial refund takes out just that part; a bank return takes it out", async () => {
    db.payments = [pay("p1"), pay("p2"), pay("p3")];
    db.refunds = [
      { finixOriginalTransferId: "t-p1", amountCents: 10000, state: "SUCCEEDED" },
      { finixOriginalTransferId: "t-p2", amountCents: 2500, state: "SUCCEEDED" },
    ];
    db.returns = [{ originalTransferId: "t-p3", amountCents: 10000 }];
    const s = (await buildDonorSummaries("c1", ["d1"], NOW)).get("d1")!;
    expect(s.lifetimeCents).toBe(7500);
    expect(s.giftCount).toBe(1);
  });

  it("a refund that hasn't completed yet does not take the gift out", async () => {
    db.payments = [pay("p1")];
    db.refunds = [{ finixOriginalTransferId: "t-p1", amountCents: 10000, state: "PENDING" }];
    expect((await buildDonorSummaries("c1", ["d1"], NOW)).get("d1")!.lifetimeCents).toBe(10000);
  });

  it("never counts anonymous gifts or gifts that gave something in return", async () => {
    db.payments = [pay("p1", { isAnonymous: true }), pay("p2", { goodsServicesProvided: true }), pay("p3")];
    expect((await buildDonorSummaries("c1", ["d1"], NOW)).get("d1")!.giftCount).toBe(1);
  });

  it("shows an active recurring gift and ignores a cancelled one", async () => {
    db.payments = [pay("p1")];
    db.subs = [
      { donorId: "d1", state: "ACTIVE", canceledAt: null, completedAt: null, amountCents: 20000, billingInterval: "MONTHLY" },
      { donorId: "d1", state: "CANCELED", canceledAt: new Date("2026-01-01"), completedAt: null, amountCents: 5000, billingInterval: "WEEKLY" },
    ];
    expect((await buildDonorSummaries("c1", ["d1"], NOW)).get("d1")!.recurring).toBe("Yes — $200.00 Monthly");
  });

  it("a donor with nothing still gets an (empty) summary", async () => {
    expect((await buildDonorSummaries("c1", ["d9"], NOW)).get("d9")).toMatchObject({ giftCount: 0, recurring: "No" });
  });
});
