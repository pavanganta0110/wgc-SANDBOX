import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = {
  fundraisingCampaign: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  campaignTeam: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  campaignFundraiser: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  givingLink: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  externalDonation: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  finixSubscription: { count: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function ownerAuth(churchId = "church-a") {
  return { userId: "u1", email: "owner@a.com", churchId, role: "owner", rawRole: "owner" };
}
function viewerAuth(churchId = "church-a") {
  return { userId: "u2", email: "viewer@a.com", churchId, role: "viewer", rawRole: "viewer" };
}

function req(body?: unknown, method = "POST") {
  return new Request("http://x", { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

async function loadCollectionRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/campaigns/route");
}
async function loadDetailRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/campaigns/[campaignId]/route");
}
async function loadTeamsRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/campaigns/[campaignId]/teams/route");
}
async function loadFundraisersRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/campaigns/[campaignId]/fundraisers/route");
}

describe("POST /api/merchant/campaigns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canCreateFundraisingCampaign", async () => {
    const { POST } = await loadCollectionRoute();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await POST(req({ name: "Spring Gala" }));
    expect(res.status).toBe(403);
  });

  it("requires a campaign name", async () => {
    const { POST } = await loadCollectionRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    const res = await POST(req({ name: "  " }));
    expect(res.status).toBe(400);
  });

  it("creates the campaign scoped to the caller's church and auto-provisions a dedicated GivingLink", async () => {
    const { POST } = await loadCollectionRoute();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue(null); // slug is free
    mockPrisma.fundraisingCampaign.create.mockResolvedValue({ id: "camp1", name: "Spring Gala", slug: "spring-gala" });
    mockPrisma.givingLink.findUnique.mockResolvedValue(null); // link slug is free
    mockPrisma.givingLink.create.mockResolvedValue({ id: "link1" });
    mockPrisma.fundraisingCampaign.update.mockResolvedValue({ id: "camp1", name: "Spring Gala", slug: "spring-gala", givingLinkId: "link1" });

    const res = await POST(req({ name: "Spring Gala" }));
    expect(res.status).toBe(200);

    expect(mockPrisma.fundraisingCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ churchId: "church-a", name: "Spring Gala", status: "DRAFT" }) })
    );
    expect(mockPrisma.givingLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ churchId: "church-a", fundraisingCampaignId: "camp1" }) })
    );
    expect(mockPrisma.fundraisingCampaign.update).toHaveBeenCalledWith({ where: { id: "camp1" }, data: { givingLinkId: "link1" } });
  });
});

describe("GET/PATCH /api/merchant/campaigns/[campaignId] (tenant isolation)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for a campaign belonging to a different church", async () => {
    const { GET } = await loadDetailRoute();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue(null);

    const res = await GET(req(undefined, "GET"), { params: Promise.resolve({ campaignId: "camp-owned-by-church-b" }) });

    expect(res.status).toBe(404);
    expect(mockPrisma.fundraisingCampaign.findFirst).toHaveBeenCalledWith({
      where: { id: "camp-owned-by-church-b", churchId: "church-a" },
    });
  });

  it("PATCH requires canEditFundraisingCampaign", async () => {
    const { PATCH } = await loadDetailRoute();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await PATCH(req({ name: "New name" }), { params: Promise.resolve({ campaignId: "camp1" }) });
    expect(res.status).toBe(403);
  });

  it("PATCH rejects an invalid status value", async () => {
    const { PATCH } = await loadDetailRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue({ id: "camp1", churchId: "church-a" });
    const res = await PATCH(req({ status: "NOT_A_REAL_STATUS" }), { params: Promise.resolve({ campaignId: "camp1" }) });
    expect(res.status).toBe(400);
  });

  it("PATCH updates status when valid", async () => {
    const { PATCH } = await loadDetailRoute();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue({ id: "camp1", churchId: "church-a" });
    mockPrisma.fundraisingCampaign.update.mockResolvedValue({ id: "camp1", status: "ACTIVE" });

    const res = await PATCH(req({ status: "ACTIVE" }), { params: Promise.resolve({ campaignId: "camp1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.fundraisingCampaign.update).toHaveBeenCalledWith({ where: { id: "camp1" }, data: { status: "ACTIVE" } });
  });
});

describe("POST /api/merchant/campaigns/[campaignId]/teams", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageCampaignRoster", async () => {
    const { POST } = await loadTeamsRoute();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await POST(req({ name: "Team A" }), { params: Promise.resolve({ campaignId: "camp1" }) });
    expect(res.status).toBe(403);
  });

  it("404s when the campaign doesn't belong to the caller's church", async () => {
    const { POST } = await loadTeamsRoute();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue(null);
    const res = await POST(req({ name: "Team A" }), { params: Promise.resolve({ campaignId: "camp-other-church" }) });
    expect(res.status).toBe(404);
  });

  it("creates a team tagged with the campaign id and provisions its own GivingLink", async () => {
    const { POST } = await loadTeamsRoute();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue({ id: "camp1", name: "Spring Gala" });
    mockPrisma.campaignTeam.findUnique.mockResolvedValue(null);
    mockPrisma.campaignTeam.create.mockResolvedValue({ id: "team1", name: "Team A", slug: "team-a" });
    mockPrisma.givingLink.findUnique.mockResolvedValue(null);
    mockPrisma.givingLink.create.mockResolvedValue({ id: "link-team1" });
    mockPrisma.campaignTeam.update.mockResolvedValue({ id: "team1", givingLinkId: "link-team1" });

    const res = await POST(req({ name: "Team A" }), { params: Promise.resolve({ campaignId: "camp1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.campaignTeam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ churchId: "church-a", fundraisingCampaignId: "camp1" }) })
    );
    expect(mockPrisma.givingLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fundraisingCampaignId: "camp1", campaignTeamId: "team1" }) })
    );
  });
});

describe("POST /api/merchant/campaigns/[campaignId]/fundraisers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a campaignTeamId that doesn't belong to the same campaign/church", async () => {
    const { POST } = await loadFundraisersRoute();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue({ id: "camp1", name: "Spring Gala" });
    mockPrisma.campaignTeam.findFirst.mockResolvedValue(null); // team not found in this campaign/church

    const res = await POST(
      req({ displayName: "Jane Smith", campaignTeamId: "team-from-elsewhere" }),
      { params: Promise.resolve({ campaignId: "camp1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockPrisma.campaignFundraiser.create).not.toHaveBeenCalled();
  });

  it("creates a fundraiser tagged with both the campaign and (when given) the team, and its own GivingLink carries all three tags", async () => {
    const { POST } = await loadFundraisersRoute();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue({ id: "camp1", name: "Spring Gala" });
    mockPrisma.campaignTeam.findFirst.mockResolvedValue({ id: "team1" });
    mockPrisma.campaignFundraiser.findUnique.mockResolvedValue(null);
    mockPrisma.campaignFundraiser.create.mockResolvedValue({ id: "fund1", displayName: "Jane Smith", slug: "jane-smith" });
    mockPrisma.givingLink.findUnique.mockResolvedValue(null);
    mockPrisma.givingLink.create.mockResolvedValue({ id: "link-fund1" });
    mockPrisma.campaignFundraiser.update.mockResolvedValue({ id: "fund1", givingLinkId: "link-fund1" });

    const res = await POST(
      req({ displayName: "Jane Smith", campaignTeamId: "team1" }),
      { params: Promise.resolve({ campaignId: "camp1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.givingLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fundraisingCampaignId: "camp1", campaignTeamId: "team1", campaignFundraiserId: "fund1" }),
      })
    );
  });
});
