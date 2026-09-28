import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLoadPublicCampaignBySlug = vi.fn();
vi.mock("@/lib/campaigns/loadPublicCampaignData", () => ({ loadPublicCampaignBySlug: (...a: unknown[]) => mockLoadPublicCampaignBySlug(...a) }));
vi.mock("@/lib/campaigns/campaignFeedRateLimit", () => ({ checkCampaignFeedRateLimit: () => true }));
vi.mock("@/lib/campaigns/campaignTotals", () => ({
  getFundraiserLeaderboard: vi.fn().mockResolvedValue([]),
  getTeamLeaderboard: vi.fn().mockResolvedValue([]),
}));

async function loadRoute() {
  vi.resetModules();
  return import("../route");
}

function req() {
  return new Request("http://x");
}
const params = { params: Promise.resolve({ slug: "spring-gala" }) };

describe("GET /api/public/campaigns/[slug]/feed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404s with a generic message for a truly nonexistent campaign", async () => {
    mockLoadPublicCampaignBySlug.mockResolvedValue({ ok: false, notFound: true });
    const { GET } = await loadRoute();
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Campaign not found");
  });

  it("returns 410 with the specific reason for an existing-but-unavailable campaign (e.g. Draft)", async () => {
    mockLoadPublicCampaignBySlug.mockResolvedValue({ ok: false, notFound: false, message: "This campaign hasn't been published yet.", church: { name: "Grace Church", logoUrl: null } });
    const { GET } = await loadRoute();
    const res = await GET(req(), params);
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("This campaign hasn't been published yet.");
  });

  it("returns the live feed for an active campaign", async () => {
    mockLoadPublicCampaignBySlug.mockResolvedValue({
      ok: true,
      view: {
        kind: "campaign",
        campaign: { id: "camp-1", churchId: "church-a", name: "Spring Gala", imageUrl: null, goalAmountCents: 100000, leaderboardEnabled: false },
        church: { name: "Grace Church", logoUrl: null },
        raisedCents: 5000,
        donorCount: 3,
        recentGifts: [],
      },
    });
    const { GET } = await loadRoute();
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Spring Gala");
    expect(body.raisedCents).toBe(5000);
  });
});
