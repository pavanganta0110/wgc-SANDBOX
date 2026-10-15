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
  it("counts the last 30 days, splitting card from bank, for this church only", async () => {
    rows.splice(0, rows.length, { amountCents: 10000, paymentMethodType: "PAYMENT_CARD" }, { amountCents: 5000, paymentMethodType: "BANK_ACCOUNT" });
    const now = new Date("2026-10-14T12:00:00Z");
    const a = await getGiftActivity("c1", now);
    expect(a).toEqual({ days: 30, gifts: 2, cardGifts: 1, bankGifts: 1, estimatedPlanningCenterFeeCents: 245 + 30 });
    expect(seen[0].where.churchId).toBe("c1");
    expect(seen[0].where.createdAt.gte.toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });
  it("no gifts, no estimate", async () => {
    rows.splice(0, rows.length);
    expect(await getGiftActivity("c1")).toMatchObject({ gifts: 0, estimatedPlanningCenterFeeCents: 0 });
  });
});
