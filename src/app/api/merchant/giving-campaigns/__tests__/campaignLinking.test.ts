import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/donors/donorPermissions", () => ({ getDonorPermissions: () => ({ canView: true, canSendStatements: true }) }));
vi.mock("@/lib/giving/campaignTemplate", () => ({ generateCampaignTrackingToken: () => "tok123" }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sms/sendText", () => ({ isSmsConfigured: () => true }));
vi.mock("@/lib/billing/smsAddonSubscriptionService", () => ({ isSmsAddonActive: vi.fn().mockResolvedValue(true) }));

const mockGivingLinkFindFirst = vi.fn();
const mockFundraisingCampaignFindFirst = vi.fn();
const mockCampaignTeamFindFirst = vi.fn();
const mockCampaignFundraiserFindFirst = vi.fn();
const mockPledgeCampaignFindFirst = vi.fn();
const mockDonorFindMany = vi.fn();
const mockGivingCampaignCreate = vi.fn();
const mockRecipientCreateMany = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    givingLink: { findFirst: (...args: unknown[]) => mockGivingLinkFindFirst(...args) },
    fundraisingCampaign: { findFirst: (...args: unknown[]) => mockFundraisingCampaignFindFirst(...args) },
    campaignTeam: { findFirst: (...args: unknown[]) => mockCampaignTeamFindFirst(...args) },
    campaignFundraiser: { findFirst: (...args: unknown[]) => mockCampaignFundraiserFindFirst(...args) },
    pledgeCampaign: { findFirst: (...args: unknown[]) => mockPledgeCampaignFindFirst(...args) },
    donor: { findMany: (...args: unknown[]) => mockDonorFindMany(...args) },
    // Nobody in these tests has unsubscribed.
    emailOptOut: { findMany: () => Promise.resolve([]) },
    givingCampaign: { create: (...args: unknown[]) => mockGivingCampaignCreate(...args) },
    givingCampaignRecipient: { createMany: (...args: unknown[]) => mockRecipientCreateMany(...args) },
  },
}));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/giving-campaigns/route");
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Spring Blast",
    channel: "EMAIL",
    emailSubject: "Hi!",
    emailBodyTemplate: "Hi {{firstName}}",
    donorIds: ["donor-1"],
    ...overrides,
  };
}

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com", churchId: "church-a", role: "owner", rawRole: "owner" });
  mockDonorFindMany.mockResolvedValue([{ id: "donor-1", name: "Jordan", email: "jordan@x.com" }]);
  mockGivingCampaignCreate.mockResolvedValue({ id: "campaign-1" });
});

describe("POST /api/merchant/giving-campaigns — tie-in resolution", () => {
  it("falls back to the plain requested givingLinkId when no tie-in is selected (preserves old behavior)", async () => {
    const { POST } = await loadRoute();
    mockGivingLinkFindFirst.mockResolvedValue({ id: "link-direct", churchId: "church-a" });
    const res = await POST(req(baseBody({ givingLinkId: "link-direct" })));
    expect(res.status).toBe(201);
    expect(mockGivingLinkFindFirst).toHaveBeenCalledWith({ where: { id: "link-direct", churchId: "church-a" } });
  });

  it("rejects when neither a giving link nor any tie-in is provided", async () => {
    const { POST } = await loadRoute();
    const res = await POST(req(baseBody()));
    expect(res.status).toBe(400);
    expect(mockGivingCampaignCreate).not.toHaveBeenCalled();
  });

  it("rejects providing both a fundraising campaign and a pledge campaign", async () => {
    const { POST } = await loadRoute();
    const res = await POST(req(baseBody({ fundraisingCampaignId: "camp-x", pledgeCampaignId: "pledge-camp-x" })));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not both/i);
  });

  it("resolves givingLinkId from a selected fundraising campaign", async () => {
    const { POST } = await loadRoute();
    mockFundraisingCampaignFindFirst.mockResolvedValue({ id: "camp-x", churchId: "church-a", givingLinkId: "link-campaign" });
    mockGivingLinkFindFirst.mockResolvedValue({ id: "link-campaign", churchId: "church-a" });
    const res = await POST(req(baseBody({ fundraisingCampaignId: "camp-x" })));
    expect(res.status).toBe(201);
    expect(mockGivingCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ givingLinkId: "link-campaign", fundraisingCampaignId: "camp-x" }) })
    );
  });

  it("rejects a fundraising campaign with no giving link set up yet", async () => {
    const { POST } = await loadRoute();
    mockFundraisingCampaignFindFirst.mockResolvedValue({ id: "camp-x", churchId: "church-a", givingLinkId: null });
    const res = await POST(req(baseBody({ fundraisingCampaignId: "camp-x" })));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/doesn't have a giving link/i);
  });

  it("auto-fills the parent campaign when a team is selected, and uses the team's own giving link", async () => {
    const { POST } = await loadRoute();
    mockCampaignTeamFindFirst.mockResolvedValue({ id: "team-x", fundraisingCampaignId: "camp-x", givingLinkId: "link-team" });
    mockGivingLinkFindFirst.mockResolvedValue({ id: "link-team", churchId: "church-a" });
    const res = await POST(req(baseBody({ campaignTeamId: "team-x" })));
    expect(res.status).toBe(201);
    expect(mockGivingCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ givingLinkId: "link-team", fundraisingCampaignId: "camp-x", campaignTeamId: "team-x" }) })
    );
  });

  it("auto-fills campaign and team when a fundraiser is selected", async () => {
    const { POST } = await loadRoute();
    mockCampaignFundraiserFindFirst.mockResolvedValue({
      id: "fr-x",
      campaignTeamId: "team-x",
      fundraisingCampaignId: "camp-x",
      givingLinkId: "link-fundraiser",
    });
    mockGivingLinkFindFirst.mockResolvedValue({ id: "link-fundraiser", churchId: "church-a" });
    const res = await POST(req(baseBody({ campaignFundraiserId: "fr-x" })));
    expect(res.status).toBe(201);
    expect(mockGivingCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          givingLinkId: "link-fundraiser",
          fundraisingCampaignId: "camp-x",
          campaignTeamId: "team-x",
          campaignFundraiserId: "fr-x",
        }),
      })
    );
  });

  it("rejects a fundraiser not on the selected team", async () => {
    const { POST } = await loadRoute();
    mockCampaignFundraiserFindFirst.mockResolvedValue({ id: "fr-x", campaignTeamId: "team-other", fundraisingCampaignId: "camp-x", givingLinkId: "link-fundraiser" });
    const res = await POST(req(baseBody({ campaignTeamId: "team-x", campaignFundraiserId: "fr-x" })));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not on the selected team/i);
  });

  it("resolves givingLinkId from a selected pledge campaign", async () => {
    const { POST } = await loadRoute();
    mockPledgeCampaignFindFirst.mockResolvedValue({ id: "pledge-camp-x", churchId: "church-a", givingLinkId: "link-pledge" });
    mockGivingLinkFindFirst.mockResolvedValue({ id: "link-pledge", churchId: "church-a" });
    const res = await POST(req(baseBody({ pledgeCampaignId: "pledge-camp-x" })));
    expect(res.status).toBe(201);
    expect(mockGivingCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ givingLinkId: "link-pledge", pledgeCampaignId: "pledge-camp-x" }) })
    );
  });

  it("rejects a pledge campaign with no giving link set up yet", async () => {
    const { POST } = await loadRoute();
    mockPledgeCampaignFindFirst.mockResolvedValue({ id: "pledge-camp-x", churchId: "church-a", givingLinkId: null });
    const res = await POST(req(baseBody({ pledgeCampaignId: "pledge-camp-x" })));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/doesn't have a giving link/i);
  });
});
