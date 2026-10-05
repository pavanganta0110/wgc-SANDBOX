import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sms/sendText", () => ({ isSmsConfigured: () => false }));

const mockPrisma = {
  textToGiveKeyword: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  fundraisingCampaign: { findFirst: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function ownerAuth() {
  return { userId: "u1", email: "owner@a.com", churchId: "church-a", role: "owner", rawRole: "owner" };
}
function viewerAuth() {
  return { userId: "u2", email: "viewer@a.com", churchId: "church-a", role: "viewer", rawRole: "viewer" };
}

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

async function loadRoute() {
  vi.resetModules();
  return import("../route");
}

describe("POST /api/merchant/text-to-give/keywords", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canEditFundraisingCampaign", async () => {
    mockAuth.mockResolvedValue(viewerAuth());
    const { POST } = await loadRoute();
    const res = await POST(req({ keyword: "BUILDING", fundraisingCampaignId: "c1" }));
    expect(res.status).toBe(403);
  });

  it("rejects a keyword already taken by another organization", async () => {
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue({ id: "c1", givingLinkId: "gl1" });
    mockPrisma.textToGiveKeyword.findUnique.mockResolvedValue({ id: "existing", churchId: "some-other-church" });

    const { POST } = await loadRoute();
    const res = await POST(req({ keyword: "BUILDING", fundraisingCampaignId: "c1" }));
    expect(res.status).toBe(409);
    expect(mockPrisma.textToGiveKeyword.create).not.toHaveBeenCalled();
  });

  it("rejects a campaign that doesn't belong to this church", async () => {
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue(null);

    const { POST } = await loadRoute();
    const res = await POST(req({ keyword: "BUILDING", fundraisingCampaignId: "someone-elses-campaign" }));
    expect(res.status).toBe(404);
  });

  it("creates a keyword, normalized to upper-case, for a valid request", async () => {
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.fundraisingCampaign.findFirst.mockResolvedValue({ id: "c1", givingLinkId: "gl1" });
    mockPrisma.textToGiveKeyword.findUnique.mockResolvedValue(null);
    mockPrisma.textToGiveKeyword.create.mockResolvedValue({ id: "kw1", keyword: "BUILDING" });

    const { POST } = await loadRoute();
    const res = await POST(req({ keyword: "  building! ", fundraisingCampaignId: "c1" }));
    expect(res.status).toBe(200);
    expect(mockPrisma.textToGiveKeyword.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ keyword: "BUILDING", churchId: "church-a" }) }));
  });
});
