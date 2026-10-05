import { describe, it, expect, vi, beforeEach } from "vitest";

describe("campaignTotals", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("getCampaignRaisedCents", () => {
    it("sums GivingLink collected amounts minus refunds and returns across all links tagged to the campaign", async () => {
      const prismaMock = {
        givingLink: {
          findMany: vi.fn().mockResolvedValue([
            { id: "link1", totalCollectedCents: 10000, refundedCents: 0, returnedCents: 0 },
            { id: "link2", totalCollectedCents: 5000, refundedCents: 1000, returnedCents: 500 },
          ]),
        },
        externalDonation: { findMany: vi.fn().mockResolvedValue([{ donationAmountCents: 2000 }]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getCampaignRaisedCents } = await import("../campaignTotals");
      const raised = await getCampaignRaisedCents("church1", "campaign1");

      // (10000 - 0 - 0) + (5000 - 1000 - 500) + 2000 external = 15500
      expect(raised).toBe(15500);
      expect(prismaMock.givingLink.findMany).toHaveBeenCalledWith({
        where: { churchId: "church1", fundraisingCampaignId: "campaign1" },
        select: { id: true, totalCollectedCents: true, refundedCents: true, returnedCents: true },
      });
    });

    it("reflects a refund immediately with no separate refund-handling code — a fully refunded link contributes zero", async () => {
      const prismaMock = {
        givingLink: {
          findMany: vi.fn().mockResolvedValue([
            { id: "link1", totalCollectedCents: 10000, refundedCents: 10000, returnedCents: 0 },
          ]),
        },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getCampaignRaisedCents } = await import("../campaignTotals");
      const raised = await getCampaignRaisedCents("church1", "campaign1");

      expect(raised).toBe(0);
    });

    it("excludes RETURNED and VOIDED external donations from the total", async () => {
      const prismaMock = {
        givingLink: { findMany: vi.fn().mockResolvedValue([]) },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getCampaignRaisedCents } = await import("../campaignTotals");
      await getCampaignRaisedCents("church1", "campaign1");

      expect(prismaMock.externalDonation.findMany).toHaveBeenCalledWith({
        where: { churchId: "church1", fundraisingCampaignId: "campaign1", status: { notIn: ["RETURNED", "VOIDED"] } },
        select: { donationAmountCents: true },
      });
    });
  });

  describe("getTeamRaisedCents / getFundraiserRaisedCents", () => {
    it("scopes the sum to campaignTeamId (which includes every fundraiser under that team, since their links share the tag)", async () => {
      const prismaMock = {
        givingLink: {
          findMany: vi.fn().mockResolvedValue([{ id: "link1", totalCollectedCents: 3000, refundedCents: 0, returnedCents: 0 }]),
        },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getTeamRaisedCents } = await import("../campaignTotals");
      const raised = await getTeamRaisedCents("church1", "team1");

      expect(raised).toBe(3000);
      expect(prismaMock.givingLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { churchId: "church1", campaignTeamId: "team1" } })
      );
    });

    it("scopes the sum to campaignFundraiserId for an individual fundraiser", async () => {
      const prismaMock = {
        givingLink: {
          findMany: vi.fn().mockResolvedValue([{ id: "link1", totalCollectedCents: 750, refundedCents: 0, returnedCents: 0 }]),
        },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getFundraiserRaisedCents } = await import("../campaignTotals");
      const raised = await getFundraiserRaisedCents("church1", "fundraiser1");

      expect(raised).toBe(750);
    });
  });

  describe("getDonorCount", () => {
    it("dedupes a donor who gave both online and offline to the same scope", async () => {
      const prismaMock = {
        givingLink: { findMany: vi.fn().mockResolvedValue([{ id: "link1" }]) },
        externalDonation: { findMany: vi.fn().mockResolvedValue([{ id: "ext1", donorId: "donorA" }]) },
        payment: { findMany: vi.fn().mockResolvedValue([{ id: "pay1", donorId: "donorA" }, { id: "pay2", donorId: "donorB" }]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getDonorCount } = await import("../campaignTotals");
      const count = await getDonorCount("church1", { fundraisingCampaignId: "campaign1" });

      // donorA (online+offline, counted once) + donorB = 2 distinct supporters
      expect(count).toBe(2);
    });

    it("counts a guest payment with no matched donor record as its own supporter, never silently dropped", async () => {
      const prismaMock = {
        givingLink: { findMany: vi.fn().mockResolvedValue([{ id: "link1" }]) },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
        payment: { findMany: vi.fn().mockResolvedValue([{ id: "pay1", donorId: null }, { id: "pay2", donorId: null }]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getDonorCount } = await import("../campaignTotals");
      const count = await getDonorCount("church1", { fundraisingCampaignId: "campaign1" });

      expect(count).toBe(2);
    });
  });

  describe("getRecentGifts (anonymity)", () => {
    it("shows null donorName when the payment itself is marked anonymous, even if the donor record has a name", async () => {
      const prismaMock = {
        givingLink: { findMany: vi.fn().mockResolvedValue([{ id: "link1" }]) },
        payment: {
          findMany: vi.fn().mockResolvedValue([
            { id: "pay1", donationAmountCents: 5000, amountCents: 5000, donorId: "donorA", isAnonymous: true, note: null, createdAt: new Date("2026-01-01") },
          ]),
        },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
        donor: { findMany: vi.fn().mockResolvedValue([{ id: "donorA", name: "Jane Smith", anonymousPreference: false }]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getRecentGifts } = await import("../campaignTotals");
      const gifts = await getRecentGifts("church1", { fundraisingCampaignId: "campaign1" });

      expect(gifts[0].donorName).toBeNull();
    });

    it("shows null donorName when the donor's standing anonymousPreference is set, even on a non-anonymous payment", async () => {
      const prismaMock = {
        givingLink: { findMany: vi.fn().mockResolvedValue([{ id: "link1" }]) },
        payment: {
          findMany: vi.fn().mockResolvedValue([
            { id: "pay1", donationAmountCents: 5000, amountCents: 5000, donorId: "donorA", isAnonymous: false, note: null, createdAt: new Date("2026-01-01") },
          ]),
        },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
        donor: { findMany: vi.fn().mockResolvedValue([{ id: "donorA", name: "Jane Smith", anonymousPreference: true }]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getRecentGifts } = await import("../campaignTotals");
      const gifts = await getRecentGifts("church1", { fundraisingCampaignId: "campaign1" });

      expect(gifts[0].donorName).toBeNull();
    });

    it("shows the donor's name when neither anonymity flag is set", async () => {
      const prismaMock = {
        givingLink: { findMany: vi.fn().mockResolvedValue([{ id: "link1" }]) },
        payment: {
          findMany: vi.fn().mockResolvedValue([
            { id: "pay1", donationAmountCents: 5000, amountCents: 5000, donorId: "donorA", isAnonymous: false, note: "Go team!", createdAt: new Date("2026-01-01") },
          ]),
        },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
        donor: { findMany: vi.fn().mockResolvedValue([{ id: "donorA", name: "Jane Smith", anonymousPreference: false }]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getRecentGifts } = await import("../campaignTotals");
      const gifts = await getRecentGifts("church1", { fundraisingCampaignId: "campaign1" });

      expect(gifts[0].donorName).toBe("Jane Smith");
      expect(gifts[0].message).toBe("Go team!");
    });
  });

  describe("leaderboards", () => {
    it("sorts fundraisers by amount raised, descending", async () => {
      const prismaMock = {
        campaignFundraiser: {
          findMany: vi.fn().mockResolvedValue([
            { id: "f1", displayName: "Alice", slug: "alice", goalAmountCents: 10000 },
            { id: "f2", displayName: "Bob", slug: "bob", goalAmountCents: 10000 },
          ]),
        },
        givingLink: {
          findMany: vi.fn().mockImplementation(({ where }: { where: { campaignFundraiserId?: string } }) => {
            if (where.campaignFundraiserId === "f1") return Promise.resolve([{ id: "l1", totalCollectedCents: 2000, refundedCents: 0, returnedCents: 0 }]);
            if (where.campaignFundraiserId === "f2") return Promise.resolve([{ id: "l2", totalCollectedCents: 9000, refundedCents: 0, returnedCents: 0 }]);
            return Promise.resolve([]);
          }),
        },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
        payment: { findMany: vi.fn().mockResolvedValue([]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getFundraiserLeaderboard } = await import("../campaignTotals");
      const board = await getFundraiserLeaderboard("church1", "campaign1");

      expect(board.map((b) => b.name)).toEqual(["Bob", "Alice"]);
      expect(board[0].raisedCents).toBe(9000);
    });

    it("scopes the fundraiser leaderboard to a single team when a teamId is passed", async () => {
      const prismaMock = {
        campaignFundraiser: { findMany: vi.fn().mockResolvedValue([]) },
        givingLink: { findMany: vi.fn().mockResolvedValue([]) },
        externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
        payment: { findMany: vi.fn().mockResolvedValue([]) },
      };
      vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));

      const { getFundraiserLeaderboard } = await import("../campaignTotals");
      await getFundraiserLeaderboard("church1", "campaign1", "team1");

      expect(prismaMock.campaignFundraiser.findMany).toHaveBeenCalledWith({
        where: { churchId: "church1", fundraisingCampaignId: "campaign1", campaignTeamId: "team1" },
        select: { id: true, displayName: true, slug: true, goalAmountCents: true },
      });
    });
  });
});
