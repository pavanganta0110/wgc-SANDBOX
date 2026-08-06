import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
const logDashboardAction = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction }));
const mergeDonors = vi.fn();
vi.mock("@/lib/donors/donorMerge", () => ({ mergeDonors }));

const mockPrisma = {
  possibleDonorMatch: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  donor: { findMany: vi.fn().mockResolvedValue([]) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function ownerAuth(churchId = "church-a") {
  return { userId: "u1", email: "owner@a.com", churchId, role: "owner", rawRole: "owner" };
}
function viewerAuth(churchId = "church-a") {
  return { userId: "u2", email: "viewer@a.com", churchId, role: "viewer", rawRole: "viewer" };
}

function pendingMatch(overrides: Record<string, any> = {}) {
  return {
    id: "match-1",
    churchId: "church-a",
    existingDonorId: "existing-1",
    candidateDonorId: "candidate-1",
    status: "PENDING",
    confidence: "MEDIUM",
    confidenceScore: 70,
    matchReason: "similar name + same address",
    matchedFields: ["name", "address"],
    conflictingFields: [],
    ...overrides,
  };
}

function req() {
  return new Request("http://x", { method: "POST" });
}

async function loadConfirm() {
  vi.resetModules();
  return import("@/app/api/merchant/donors/matches/[matchId]/confirm/route");
}
async function loadReject() {
  vi.resetModules();
  return import("@/app/api/merchant/donors/matches/[matchId]/reject/route");
}
async function loadSkip() {
  vi.resetModules();
  return import("@/app/api/merchant/donors/matches/[matchId]/skip/route");
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/merchant/donors/matches/[matchId]/confirm", () => {
  it("a viewer without canReviewMatches is rejected", async () => {
    const { POST } = await loadConfirm();
    mockAuth.mockResolvedValue(viewerAuth());
    mockPrisma.possibleDonorMatch.findFirst.mockResolvedValue(pendingMatch());
    const res = await POST(req(), { params: Promise.resolve({ matchId: "match-1" }) });
    expect(res.status).toBe(401);
    expect(mergeDonors).not.toHaveBeenCalled();
  });

  it("a matchId belonging to a different church is rejected (cross-merchant access denied), even for an authorized owner", async () => {
    const { POST } = await loadConfirm();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    // The Prisma where clause itself scopes by churchId — a cross-church
    // lookup returns null from the mock, exactly like a real DB query would.
    mockPrisma.possibleDonorMatch.findFirst.mockImplementation((args: any) =>
      Promise.resolve(args.where.churchId === "church-a" && args.where.id === "match-1" ? null : null),
    );
    const res = await POST(req(), { params: Promise.resolve({ matchId: "match-1" }) });
    expect(res.status).toBe(404);
    expect(mergeDonors).not.toHaveBeenCalled();
    expect(mockPrisma.possibleDonorMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "match-1", churchId: "church-a" } }),
    );
  });

  it("an owner confirming merges existingDonorId <- candidateDonorId and marks the match CONFIRMED", async () => {
    const { POST } = await loadConfirm();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.possibleDonorMatch.findFirst.mockResolvedValue(pendingMatch());
    mergeDonors.mockResolvedValue({ reassigned: { payments: 1, externalDonations: 2 } });

    const res = await POST(req(), { params: Promise.resolve({ matchId: "match-1" }) });

    expect(res.status).toBe(200);
    expect(mergeDonors).toHaveBeenCalledWith("existing-1", "candidate-1", "church-a", "u1", "owner@a.com");
    expect(mockPrisma.possibleDonorMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "match-1" }, data: expect.objectContaining({ status: "CONFIRMED" }) }),
    );
    const actions = logDashboardAction.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("donor.match_manually_confirmed");
    expect(actions).toContain("donor.merged");
    expect(actions).toContain("donor.merge_completed");
  });

  it("an already-resolved match cannot be confirmed again", async () => {
    const { POST } = await loadConfirm();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.possibleDonorMatch.findFirst.mockResolvedValue(pendingMatch({ status: "REJECTED" }));

    const res = await POST(req(), { params: Promise.resolve({ matchId: "match-1" }) });
    expect(res.status).toBe(400);
    expect(mergeDonors).not.toHaveBeenCalled();
  });

  it("logs donor.merge_failed and does not mark the match CONFIRMED when mergeDonors throws", async () => {
    const { POST } = await loadConfirm();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.possibleDonorMatch.findFirst.mockResolvedValue(pendingMatch());
    mergeDonors.mockRejectedValue(new Error("boom"));

    const res = await POST(req(), { params: Promise.resolve({ matchId: "match-1" }) });

    expect(res.status).toBe(400);
    expect(mockPrisma.possibleDonorMatch.update).not.toHaveBeenCalled();
    const actions = logDashboardAction.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("donor.merge_failed");
  });
});

describe("POST /api/merchant/donors/matches/[matchId]/reject", () => {
  it("marks the match REJECTED without touching donor records", async () => {
    const { POST } = await loadReject();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.possibleDonorMatch.findFirst.mockResolvedValue(pendingMatch());

    const res = await POST(req(), { params: Promise.resolve({ matchId: "match-1" }) });

    expect(res.status).toBe(200);
    expect(mergeDonors).not.toHaveBeenCalled();
    expect(mockPrisma.possibleDonorMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED" }) }),
    );
    const actions = logDashboardAction.mock.calls.map((c) => c[0].action);
    expect(actions).toContain("donor.match_manually_rejected");
    expect(actions).toContain("donor.new_donor_after_review");
  });
});

describe("POST /api/merchant/donors/matches/[matchId]/skip", () => {
  it("marks the match SKIPPED, leaving it resolvable later only via a fresh match", async () => {
    const { POST } = await loadSkip();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.possibleDonorMatch.findFirst.mockResolvedValue(pendingMatch());

    const res = await POST(req(), { params: Promise.resolve({ matchId: "match-1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.possibleDonorMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }),
    );
  });
});
