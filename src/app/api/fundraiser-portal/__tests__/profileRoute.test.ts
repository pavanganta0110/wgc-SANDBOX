import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireFundraiserSession = vi.fn();
vi.mock("@/lib/fundraiserPortal/fundraiserAuth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fundraiserPortal/fundraiserAuth")>("@/lib/fundraiserPortal/fundraiserAuth");
  return { ...actual, requireFundraiserSession: () => mockRequireFundraiserSession() };
});

const mockPrisma = {
  fundraisingCampaign: { findUnique: vi.fn() },
  campaignFundraiser: { update: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function session() {
  return { campaignFundraiserId: "f1", churchId: "church-a", fundraisingCampaignId: "c1" };
}

function req(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
}

async function loadRoute() {
  vi.resetModules();
  return import("../profile/route");
}

describe("PATCH /api/fundraiser-portal/profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects the edit when the campaign has not enabled fundraiser self-edit", async () => {
    mockRequireFundraiserSession.mockResolvedValue(session());
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue({ fundraiserSelfEditEnabled: false });

    const { PATCH } = await loadRoute();
    const res = await PATCH(req({ displayName: "New Name" }));
    expect(res.status).toBe(403);
    expect(mockPrisma.campaignFundraiser.update).not.toHaveBeenCalled();
  });

  it("allows the edit when the campaign has self-edit enabled", async () => {
    mockRequireFundraiserSession.mockResolvedValue(session());
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue({ fundraiserSelfEditEnabled: true });
    mockPrisma.campaignFundraiser.update.mockResolvedValue({ displayName: "New Name", personalStory: null, imageUrl: null, goalAmountCents: null });

    const { PATCH } = await loadRoute();
    const res = await PATCH(req({ displayName: "New Name" }));
    expect(res.status).toBe(200);
    expect(mockPrisma.campaignFundraiser.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "f1" } }));
  });

  it("rejects a blank display name", async () => {
    mockRequireFundraiserSession.mockResolvedValue(session());
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue({ fundraiserSelfEditEnabled: true });

    const { PATCH } = await loadRoute();
    const res = await PATCH(req({ displayName: "   " }));
    expect(res.status).toBe(400);
  });
});
