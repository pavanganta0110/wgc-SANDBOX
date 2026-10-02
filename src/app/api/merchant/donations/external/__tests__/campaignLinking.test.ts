import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/donations/checkExternalDonationDuplicate", () => ({ findPossibleDuplicateExternalDonation: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/donors/resolveOrCreateDonorWithMatchReview", () => ({ resolveOrCreateDonorWithMatchReview: vi.fn() }));

const mockComputePledgeFulfillment = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/pledges/pledgeFulfillment", () => ({ computePledgeFulfillment: (...args: unknown[]) => mockComputePledgeFulfillment(...args) }));

const mockCreate = vi.fn();
const mockPledgeFindFirst = vi.fn();
const mockFundraiserFindFirst = vi.fn();
const mockTeamFindFirst = vi.fn();
const mockCampaignFindFirst = vi.fn();
const mockDonorFindFirst = vi.fn();
const mockAuditLogCreate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalDonation: { create: (...args: unknown[]) => mockCreate(...args) },
    externalDonationAuditLog: { create: (...args: unknown[]) => mockAuditLogCreate(...args) },
    pledge: { findFirst: (...args: unknown[]) => mockPledgeFindFirst(...args) },
    campaignFundraiser: { findFirst: (...args: unknown[]) => mockFundraiserFindFirst(...args) },
    campaignTeam: { findFirst: (...args: unknown[]) => mockTeamFindFirst(...args) },
    fundraisingCampaign: { findFirst: (...args: unknown[]) => mockCampaignFindFirst(...args) },
    donor: { findFirst: (...args: unknown[]) => mockDonorFindFirst(...args) },
  },
}));

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/donations/external/route");
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    donationAmountCents: 5000,
    donationDate: "2026-01-15",
    paymentMethod: "CASH",
    donorMode: "unmatched",
    ...overrides,
  };
}

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com", churchId: "church-a", role: "owner", rawRole: "owner" });
  mockCreate.mockResolvedValue({ id: "donation-1" });
});

describe("POST /api/merchant/donations/external — pledge linking", () => {
  it("rejects a pledgeId that doesn't belong to this church", async () => {
    const { POST } = await loadRoute();
    mockPledgeFindFirst.mockResolvedValue(null);
    const res = await POST(req(baseBody({ pledgeId: "pledge-x" })));
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects linking to a canceled pledge", async () => {
    const { POST } = await loadRoute();
    mockPledgeFindFirst.mockResolvedValue({ id: "pledge-x", churchId: "church-a", status: "CANCELED", donorId: null });
    const res = await POST(req(baseBody({ pledgeId: "pledge-x" })));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/canceled pledge/i);
  });

  it("rejects linking a donation with a known donor to a pledge belonging to a different donor", async () => {
    const { POST } = await loadRoute();
    mockDonorFindFirst.mockResolvedValue({ id: "donor-mine", churchId: "church-a" });
    mockPledgeFindFirst.mockResolvedValue({ id: "pledge-x", churchId: "church-a", status: "PROMISED", donorId: "donor-other" });
    const res = await POST(req(baseBody({ pledgeId: "pledge-x", donorMode: "existing", donorId: "donor-mine" })));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/different donor/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("allows linking when the donation's donor matches the pledge's donor", async () => {
    const { POST } = await loadRoute();
    mockDonorFindFirst.mockResolvedValue({ id: "donor-mine", churchId: "church-a" });
    mockPledgeFindFirst.mockResolvedValue({ id: "pledge-x", churchId: "church-a", status: "PROMISED", donorId: "donor-mine" });
    const res = await POST(req(baseBody({ pledgeId: "pledge-x", donorMode: "existing", donorId: "donor-mine" })));
    expect(res.status).toBe(201);
    expect(mockComputePledgeFulfillment).toHaveBeenCalledWith("pledge-x");
  });

  it("links an unmatched donation to an open pledge and rolls up fulfillment", async () => {
    const { POST } = await loadRoute();
    mockPledgeFindFirst.mockResolvedValue({ id: "pledge-x", churchId: "church-a", status: "PROMISED", donorId: null });
    const res = await POST(req(baseBody({ pledgeId: "pledge-x" })));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pledgeId: "pledge-x" }) }));
    expect(mockComputePledgeFulfillment).toHaveBeenCalledWith("pledge-x");
  });

  it("never calls computePledgeFulfillment when no pledge is linked", async () => {
    const { POST } = await loadRoute();
    const res = await POST(req(baseBody()));
    expect(res.status).toBe(201);
    expect(mockComputePledgeFulfillment).not.toHaveBeenCalled();
  });
});

describe("POST /api/merchant/donations/external — fundraising campaign linking", () => {
  it("rejects a fundraisingCampaignId that doesn't belong to this church", async () => {
    const { POST } = await loadRoute();
    mockCampaignFindFirst.mockResolvedValue(null);
    const res = await POST(req(baseBody({ fundraisingCampaignId: "camp-x" })));
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("links a donation to a campaign with no team/fundraiser", async () => {
    const { POST } = await loadRoute();
    mockCampaignFindFirst.mockResolvedValue({ id: "camp-x", churchId: "church-a" });
    const res = await POST(req(baseBody({ fundraisingCampaignId: "camp-x" })));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fundraisingCampaignId: "camp-x", campaignTeamId: null, campaignFundraiserId: null }) })
    );
  });

  it("rejects a team that isn't on the selected campaign", async () => {
    const { POST } = await loadRoute();
    mockTeamFindFirst.mockResolvedValue({ id: "team-x", fundraisingCampaignId: "camp-other" });
    const res = await POST(req(baseBody({ fundraisingCampaignId: "camp-x", campaignTeamId: "team-x" })));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not on the selected campaign/i);
  });

  it("rejects a fundraiser that isn't on the selected team", async () => {
    const { POST } = await loadRoute();
    mockFundraiserFindFirst.mockResolvedValue({ id: "fr-x", campaignTeamId: "team-other", fundraisingCampaignId: "camp-x" });
    const res = await POST(req(baseBody({ campaignTeamId: "team-x", campaignFundraiserId: "fr-x" })));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not on the selected team/i);
  });

  it("auto-fills campaign and team from a selected fundraiser", async () => {
    const { POST } = await loadRoute();
    mockFundraiserFindFirst.mockResolvedValue({ id: "fr-x", campaignTeamId: "team-x", fundraisingCampaignId: "camp-x" });
    const res = await POST(req(baseBody({ campaignFundraiserId: "fr-x" })));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fundraisingCampaignId: "camp-x", campaignTeamId: "team-x", campaignFundraiserId: "fr-x" }) })
    );
  });
});
