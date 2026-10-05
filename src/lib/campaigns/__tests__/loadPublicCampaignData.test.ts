import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  fundraisingCampaign: { findUnique: vi.fn() },
  campaignTeam: { findUnique: vi.fn() },
  campaignFundraiser: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
  givingLink: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/campaigns/campaignTotals", () => ({
  getCampaignRaisedCents: vi.fn().mockResolvedValue(5000),
  getTeamRaisedCents: vi.fn().mockResolvedValue(3000),
  getFundraiserRaisedCents: vi.fn().mockResolvedValue(1000),
  getRecentGifts: vi.fn().mockResolvedValue([]),
  getDonorCount: vi.fn().mockResolvedValue(2),
}));

function campaign(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "camp-1", churchId: "church-a", slug: "spring-gala", status: "ACTIVE", archivedAt: null, givingLinkId: null, ...overrides };
}
function church() {
  return { name: "Grace Church", logoUrl: null };
}

async function loadModule() {
  vi.resetModules();
  return import("../loadPublicCampaignData");
}

describe("loadPublicCampaignBySlug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns notFound: true when no campaign has that slug", async () => {
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(null);
    const { loadPublicCampaignBySlug } = await loadModule();
    const result = await loadPublicCampaignBySlug("nope");
    expect(result).toEqual({ ok: false, notFound: true });
  });

  it("returns notFound: true when the campaign's church is missing (data integrity gap)", async () => {
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(campaign());
    mockPrisma.church.findUnique.mockResolvedValue(null);
    const { loadPublicCampaignBySlug } = await loadModule();
    const result = await loadPublicCampaignBySlug("spring-gala");
    expect(result).toEqual({ ok: false, notFound: true });
  });

  it("a DRAFT campaign is found but not shown as a 404 — it gets a specific message", async () => {
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(campaign({ status: "DRAFT" }));
    mockPrisma.church.findUnique.mockResolvedValue(church());
    const { loadPublicCampaignBySlug } = await loadModule();
    const result = await loadPublicCampaignBySlug("spring-gala");
    expect(result).toEqual({ ok: false, notFound: false, message: "This campaign hasn't been published yet.", church: church() });
  });

  it("a PAUSED campaign gets its own message", async () => {
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(campaign({ status: "PAUSED" }));
    mockPrisma.church.findUnique.mockResolvedValue(church());
    const { loadPublicCampaignBySlug } = await loadModule();
    const result = await loadPublicCampaignBySlug("spring-gala");
    expect(result.ok).toBe(false);
    expect(!result.ok && !result.notFound && result.message).toBe("This campaign isn't currently accepting gifts.");
  });

  it("a COMPLETED campaign gets its own message", async () => {
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(campaign({ status: "COMPLETED" }));
    mockPrisma.church.findUnique.mockResolvedValue(church());
    const { loadPublicCampaignBySlug } = await loadModule();
    const result = await loadPublicCampaignBySlug("spring-gala");
    expect(result.ok).toBe(false);
    expect(!result.ok && !result.notFound && result.message).toBe("This campaign has ended. Thank you to everyone who gave!");
  });

  it("an archived campaign is treated as unavailable even if status still reads ACTIVE", async () => {
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(campaign({ status: "ACTIVE", archivedAt: new Date() }));
    mockPrisma.church.findUnique.mockResolvedValue(church());
    const { loadPublicCampaignBySlug } = await loadModule();
    const result = await loadPublicCampaignBySlug("spring-gala");
    expect(result.ok).toBe(false);
    expect(!result.ok && !result.notFound && result.message).toBe("This campaign is no longer available.");
  });

  it("an ACTIVE, non-archived campaign loads normally", async () => {
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(campaign());
    mockPrisma.church.findUnique.mockResolvedValue(church());
    const { loadPublicCampaignBySlug } = await loadModule();
    const result = await loadPublicCampaignBySlug("spring-gala");
    expect(result.ok).toBe(true);
    expect(result.ok && result.view.kind).toBe("campaign");
  });
});

describe("loadPublicTeamBySlug / loadPublicFundraiserBySlug — unavailable-campaign message propagates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a team under a DRAFT campaign reports the campaign's message, not a bare 404", async () => {
    mockPrisma.campaignTeam.findUnique.mockResolvedValue({ id: "team-1", churchId: "church-a", fundraisingCampaignId: "camp-1", slug: "team-x", givingLinkId: null });
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(campaign({ status: "DRAFT" }));
    mockPrisma.church.findUnique.mockResolvedValue(church());
    const { loadPublicTeamBySlug } = await loadModule();
    const result = await loadPublicTeamBySlug("team-x");
    expect(result).toEqual({ ok: false, notFound: false, message: "This campaign hasn't been published yet.", church: church() });
  });

  it("a fundraiser under a PAUSED campaign reports the campaign's message", async () => {
    mockPrisma.campaignFundraiser.findUnique.mockResolvedValue({ id: "f-1", churchId: "church-a", fundraisingCampaignId: "camp-1", slug: "f-x", givingLinkId: null });
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(campaign({ status: "PAUSED" }));
    mockPrisma.church.findUnique.mockResolvedValue(church());
    const { loadPublicFundraiserBySlug } = await loadModule();
    const result = await loadPublicFundraiserBySlug("f-x");
    expect(result.ok).toBe(false);
    expect(!result.ok && !result.notFound && result.message).toBe("This campaign isn't currently accepting gifts.");
  });

  it("a nonexistent team slug is a real notFound", async () => {
    mockPrisma.campaignTeam.findUnique.mockResolvedValue(null);
    const { loadPublicTeamBySlug } = await loadModule();
    expect(await loadPublicTeamBySlug("nope")).toEqual({ ok: false, notFound: true });
  });

  it("a nonexistent fundraiser slug is a real notFound", async () => {
    mockPrisma.campaignFundraiser.findUnique.mockResolvedValue(null);
    const { loadPublicFundraiserBySlug } = await loadModule();
    expect(await loadPublicFundraiserBySlug("nope")).toEqual({ ok: false, notFound: true });
  });
});
