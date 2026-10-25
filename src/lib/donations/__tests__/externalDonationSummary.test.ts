import { describe, it, expect, vi, beforeEach } from "vitest";

const aggregate = vi.fn();
const findFirst = vi.fn();
const donorFind = vi.fn();
const notifyEvent = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalDonation: { aggregate: (a: unknown) => aggregate(a), findFirst: (a: unknown) => findFirst(a) },
    donor: { findUnique: (a: unknown) => donorFind(a) },
  },
}));
vi.mock("@/lib/settings/notificationDispatch", () => ({ notifyEvent: (a: unknown) => notifyEvent(a) }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));

import { getExternalDonationsTotal } from "@/lib/reports/insightsData";
import { notifyMerchantOfExternalDonation } from "../notifyExternalDonationRecorded";
import { NOTIFICATION_EVENTS } from "@/lib/settings/notificationEvents";

beforeEach(() => vi.clearAllMocks());

describe("getExternalDonationsTotal", () => {
  it("scopes to the church, date range and recorder, and excludes voided/returned gifts", async () => {
    aggregate.mockResolvedValue({ _sum: { donationAmountCents: 12345 }, _count: { _all: 3 } });
    const range = { gte: new Date("2026-01-01") };
    const res = await getExternalDonationsTotal("church-1", range, "user-1");
    expect(res).toEqual({ totalCents: 12345, count: 3 });
    const where = aggregate.mock.calls[0][0].where;
    expect(where.churchId).toBe("church-1");
    expect(where.status).toEqual({ not: "VOIDED" });
    expect(where.donationDate).toBe(range);
    expect(where.createdByUserId).toBe("user-1");
    expect(where.OR).toContainEqual({ depositStatus: null });
  });

  it("returns zeros when there are no rows", async () => {
    aggregate.mockResolvedValue({ _sum: { donationAmountCents: null }, _count: { _all: 0 } });
    expect(await getExternalDonationsTotal("c", undefined)).toEqual({ totalCents: 0, count: 0 });
  });
});

describe("notifyMerchantOfExternalDonation", () => {
  it("is a registered notification event", () => {
    expect(NOTIFICATION_EVENTS.some((e) => e.key === "EXTERNAL_DONATION_RECORDED")).toBe(true);
  });

  it("notifies the org with the external-donation event and hides anonymous donor names", async () => {
    findFirst.mockResolvedValue({
      id: "ext-1", donorId: null, isAnonymous: true, donationAmountCents: 5000, paymentMethod: "CHECK",
      otherPaymentMethodName: null, fundName: "General", donationDate: new Date("2026-03-04"),
    });
    await notifyMerchantOfExternalDonation("ext-1", "church-1");
    const call = notifyEvent.mock.calls[0][0];
    expect(call.churchId).toBe("church-1");
    expect(call.eventKey).toBe("EXTERNAL_DONATION_RECORDED");
    expect(call.relatedEntityId).toBe("ext-1");
    expect(call.bodyHtml).toContain("$50.00");
    expect(call.bodyHtml).toContain("An anonymous donor");
  });

  it("does nothing when the donation is not in that church", async () => {
    findFirst.mockResolvedValue(null);
    await notifyMerchantOfExternalDonation("x", "church-1");
    expect(notifyEvent).not.toHaveBeenCalled();
  });
});
