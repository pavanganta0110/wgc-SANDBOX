import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    donorPortalSession: { groupBy: vi.fn() },
    donor: { findMany: vi.fn() },
    orgEmailLog: { count: vi.fn() },
    subscriptionAction: { count: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { loadPortalActivity, loadPortalSignedInEmails } from "../portalActivity";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400e3);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.orgEmailLog.count.mockResolvedValue(0);
  prismaMock.subscriptionAction.count.mockResolvedValue(0);
});

describe("loadPortalActivity", () => {
  it("counts people, not donor records — two records with one email are one person", async () => {
    prismaMock.donorPortalSession.groupBy.mockResolvedValue([
      { donorId: "d1", _max: { createdAt: daysAgo(40), lastActiveAt: daysAgo(40) } },
      { donorId: "d2", _max: { createdAt: daysAgo(2), lastActiveAt: daysAgo(1) } },
      { donorId: "d3", _max: { createdAt: daysAgo(50), lastActiveAt: null } },
    ]);
    prismaMock.donor.findMany.mockResolvedValue([
      { id: "d1", email: "Ann@Example.com", normalizedEmail: null },
      { id: "d2", email: "ann@example.com", normalizedEmail: "ann@example.com" },
      { id: "d3", email: "bob@example.com", normalizedEmail: "bob@example.com" },
    ]);
    const a = await loadPortalActivity("church1");
    expect(a.signedInPeople).toBe(2);
    expect(a.activeLast30Days).toBe(1); // Ann (most recent session wins); Bob's only session is 50 days old
  });

  it("scopes every query to the church", async () => {
    prismaMock.donorPortalSession.groupBy.mockResolvedValue([]);
    await loadPortalActivity("church1");
    expect(prismaMock.donorPortalSession.groupBy.mock.calls[0][0].where).toEqual({ churchId: "church1" });
    expect(prismaMock.orgEmailLog.count.mock.calls[0][0].where).toMatchObject({ churchId: "church1", relatedEntityType: "DONOR_PORTAL_INVITE", status: "SENT" });
    for (const call of prismaMock.subscriptionAction.count.mock.calls) {
      expect(call[0].where).toMatchObject({ churchId: "church1", state: "COMPLETED", requestedByUserId: null, newValue: { path: ["source"], equals: "DONOR_PORTAL" } });
    }
  });

  it("reports invites and donor-made changes separately from merchant-made ones", async () => {
    prismaMock.donorPortalSession.groupBy.mockResolvedValue([]);
    prismaMock.orgEmailLog.count.mockResolvedValue(12);
    prismaMock.subscriptionAction.count.mockImplementation(async ({ where }: { where: { actionType: string } }) => (where.actionType === "UPDATE_AMOUNT" ? 3 : 1));
    const a = await loadPortalActivity("church1");
    expect(a).toMatchObject({ signedInPeople: 0, invitesSent: 12, amountChangesByDonors: 3, cancellationsByDonors: 1 });
  });

  it("skips sessions whose donor has no email rather than counting an unknown person", async () => {
    prismaMock.donorPortalSession.groupBy.mockResolvedValue([{ donorId: "d1", _max: { createdAt: daysAgo(1), lastActiveAt: daysAgo(1) } }]);
    prismaMock.donor.findMany.mockResolvedValue([{ id: "d1", email: null, normalizedEmail: null }]);
    expect((await loadPortalActivity("church1")).signedInPeople).toBe(0);
  });
});

describe("loadPortalSignedInEmails", () => {
  it("returns normalized emails for the Donors-list marker", async () => {
    prismaMock.donorPortalSession.groupBy.mockResolvedValue([{ donorId: "d1", _max: { createdAt: daysAgo(1), lastActiveAt: null } }]);
    prismaMock.donor.findMany.mockResolvedValue([{ id: "d1", email: "Ann@Example.com", normalizedEmail: null }]);
    expect([...(await loadPortalSignedInEmails("church1"))]).toEqual(["ann@example.com"]);
  });
});
