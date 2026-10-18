/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes */
import { describe, it, expect, vi } from "vitest";

const rows: any[] = [];
const seen: any[] = [];
vi.mock("@/lib/prisma", () => ({ prisma: { payment: { findMany: async (a: any) => { seen.push(a); return rows; } } } }));

import { estimatePlanningCenterFeeCents, getGiftActivity } from "../giftActivity";

describe("estimatePlanningCenterFeeCents", () => {
  it("uses Planning Center's published rates: 2.15% + $0.30 per card gift, $0.30 per bank gift", () => {
    // $100 card gift: $2.15 + $0.30 = $2.45; $100 bank gift: $0.30
    expect(estimatePlanningCenterFeeCents({ count: 1, cents: 10000 }, 0)).toBe(245);
    expect(estimatePlanningCenterFeeCents({ count: 0, cents: 0 }, 1)).toBe(30);
    expect(estimatePlanningCenterFeeCents({ count: 2, cents: 25000 }, 3)).toBe(Math.round(25000 * 0.0215) + 60 + 90);
  });
  it("is zero with no gifts", () => expect(estimatePlanningCenterFeeCents({ count: 0, cents: 0 }, 0)).toBe(0));
});

describe("getGiftActivity", () => {
  const pay = (over: any = {}) => ({ amountCents: 10000, donationAmountCents: null, paymentMethodType: "PAYMENT_CARD", percentageBps: 230, fixedFeeCents: 25, feeCoveredCents: null, donorCoversFee: false, ...over });
  const NOW = new Date("2026-10-14T12:00:00Z");

  it("counts the last 30 days for this church only, splitting card from bank", async () => {
    rows.splice(0, rows.length, pay(), pay({ amountCents: 5000, paymentMethodType: "BANK_ACCOUNT" }));
    const a = await getGiftActivity("c1", NOW);
    expect(a).toMatchObject({ days: 30, gifts: 2, cardGifts: 1, bankGifts: 1, giftTotalCents: 15000 });
    expect(seen[0].where.churchId).toBe("c1");
    expect(seen[0].where.createdAt.gte.toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });

  it("Planning Center's side assumes the church pays the fee: 2.15% + 30c per card gift, 30c per bank gift", async () => {
    rows.splice(0, rows.length, pay(), pay({ amountCents: 5000, paymentMethodType: "BANK_ACCOUNT" }));
    expect((await getGiftActivity("c1", NOW)).estimatedPlanningCenterFeeCents).toBe(245 + 30);
  });

  it("WGC's side is exact, from the rate saved on each payment: a church-absorbed gift costs the church its fee", async () => {
    rows.splice(0, rows.length, pay()); // $100 at 2.3% + 25c = $2.55
    const a = await getGiftActivity("c1", NOW);
    expect(a.wgcFeesCents).toBe(255);
    expect(a.wgcFeesPaidByChurchCents).toBe(255);
  });

  it("a gift whose donor covered the fee costs the church nothing, and is shown as covered by the donor", async () => {
    rows.splice(0, rows.length, pay({ donorCoversFee: true, feeCoveredCents: 255, amountCents: 10255, donationAmountCents: 10000 }));
    const a = await getGiftActivity("c1", NOW);
    expect(a.giftTotalCents).toBe(10000);
    expect(a.wgcFeesCents).toBe(255);
    expect(a.wgcFeesPaidByChurchCents).toBe(0);
  });

  it("a mix adds up: one absorbed, one covered", async () => {
    rows.splice(0, rows.length, pay(), pay({ donorCoversFee: true, feeCoveredCents: 255, donationAmountCents: 10000, amountCents: 10255 }));
    const a = await getGiftActivity("c1", NOW);
    expect(a).toMatchObject({ wgcFeesCents: 510, wgcFeesPaidByChurchCents: 255 });
  });

  it("says 'not available' (null) rather than guessing when any gift has no saved rate", async () => {
    rows.splice(0, rows.length, pay(), pay({ percentageBps: null }));
    const a = await getGiftActivity("c1", NOW);
    expect(a.wgcFeesCents).toBeNull();
    expect(a.wgcFeesPaidByChurchCents).toBeNull();
    expect(a.estimatedPlanningCenterFeeCents).toBeGreaterThan(0);
  });

  it("no gifts, no estimate", async () => {
    rows.splice(0, rows.length);
    expect(await getGiftActivity("c1")).toMatchObject({ gifts: 0, giftTotalCents: 0, estimatedPlanningCenterFeeCents: 0, wgcFeesCents: 0, wgcFeesPaidByChurchCents: 0 });
  });
});
