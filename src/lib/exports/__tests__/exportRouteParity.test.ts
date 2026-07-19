import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));

const mockResolveViewScope = vi.fn();
vi.mock("@/lib/auth/viewScope", () => ({ resolveViewScope: (...a: unknown[]) => mockResolveViewScope(...a) }));

const mockResolveScopedUserId = vi.fn();
vi.mock("@/lib/auth/scopes", () => ({ resolveScopedUserId: (...a: unknown[]) => mockResolveScopedUserId(...a) }));

const mockSummary = vi.fn();
vi.mock("@/lib/settings/teamMemberDetail", () => ({ loadTeamMemberSummary: (...a: unknown[]) => mockSummary(...a) }));

const mockCanExport = vi.fn((..._args: unknown[]) => true);
vi.mock("@/lib/settings/teamMemberAccess", () => ({ canExportTeamMemberData: (...a: unknown[]) => mockCanExport(...a) }));

const mockBuildReportData = vi.fn();
const mockRenderCsv = vi.fn((..._args: unknown[]) => "csv");
const mockRenderPdf = vi.fn();
const mockResolveUserIdentity = vi.fn();
vi.mock("@/lib/exports/transactionReportData", () => ({
  buildTransactionReportData: (...a: unknown[]) => mockBuildReportData(...a),
  renderTransactionReportCsv: (...a: unknown[]) => mockRenderCsv(...a),
  renderTransactionReportPdf: (...a: unknown[]) => mockRenderPdf(...a),
  resolveUserIdentity: (...a: unknown[]) => mockResolveUserIdentity(...a),
}));

async function loadModules() {
  vi.resetModules();
  const orgRoute = await import("@/app/api/merchant/transactions/payments/export/route");
  const memberRoute = await import("@/app/api/merchant/settings/team/[userId]/export/route");
  return { orgRoute, memberRoute };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanExport.mockReturnValue(true);
  mockBuildReportData.mockResolvedValue({ rows: [], summary: {} });
});

describe("Export route parity — organization vs team-member export", () => {
  it("both routes call the exact same shared report builder (same function, not independently maintained CSV code)", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner", email: "owner@church-a.com" });
    mockResolveViewScope.mockResolvedValue({});
    mockResolveScopedUserId.mockReturnValue(undefined); // org-wide, no team-member scope selected
    mockSummary.mockResolvedValue({ userId: "user-2", email: "fund@church-a.com", role: "fundraiser" });

    const { orgRoute, memberRoute } = await loadModules();

    await orgRoute.GET(new Request("http://x/api/merchant/transactions/payments/export"));
    await memberRoute.GET(new Request("http://x/api/merchant/settings/team/user-2/export"), { params: Promise.resolve({ userId: "user-2" }) });

    expect(mockBuildReportData).toHaveBeenCalledTimes(2);
    const [orgCall, memberCall] = mockBuildReportData.mock.calls.map((c) => c[0]);

    // Same churchId re-derived from the session both times (never trusted
    // from the client), and the only real difference is the filter.
    expect(orgCall.churchId).toBe(memberCall.churchId);
    expect(orgCall.filter).not.toEqual(memberCall.filter);
    expect(memberCall.filter).toEqual({ attributedUserId: "user-2" });
  });

  it("organization export (no scoped user) requests an unfiltered attributedUserId — includes every authorized payment", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner", email: "owner@church-a.com" });
    mockResolveViewScope.mockResolvedValue({});
    mockResolveScopedUserId.mockReturnValue(undefined);

    const { orgRoute } = await loadModules();
    await orgRoute.GET(new Request("http://x/api/merchant/transactions/payments/export"));

    expect(mockBuildReportData).toHaveBeenCalledWith(expect.objectContaining({ scope: "ENTIRE_ORGANIZATION", filter: expect.objectContaining({ attributedUserId: undefined }) }));
  });

  it("a fundraiser's own dashboard scope (view-scope resolves to their own userId) exports only their attributed records", async () => {
    mockAuth.mockResolvedValue({ userId: "fund-1", churchId: "church-a", rawRole: "fundraiser", role: "fundraiser", email: "fund-1@church-a.com" });
    mockResolveViewScope.mockResolvedValue({});
    mockResolveScopedUserId.mockReturnValue("fund-1"); // FUNDRAISER is always forced to their own scope
    mockResolveUserIdentity.mockResolvedValue({ name: "fund-1@church-a.com", email: "fund-1@church-a.com", role: "fundraiser" });

    const { orgRoute } = await loadModules();
    await orgRoute.GET(new Request("http://x/api/merchant/transactions/payments/export"));

    expect(mockBuildReportData).toHaveBeenCalledWith(expect.objectContaining({ scope: "MY_ACTIVITY", filter: expect.objectContaining({ attributedUserId: "fund-1" }) }));
  });

  it("team-member export scope always matches the dashboard's resolveScopedUserId mechanism, not a client-supplied churchId/userId", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner", email: "owner@church-a.com" });
    mockSummary.mockResolvedValue(null); // loadTeamMemberSummary already scopes by churchId — cross-church target resolves to null

    const { memberRoute } = await loadModules();
    const res = await memberRoute.GET(new Request("http://x/api/merchant/settings/team/other-church-user/export"), {
      params: Promise.resolve({ userId: "other-church-user" }),
    });

    expect(res.status).toBe(404);
    expect(mockBuildReportData).not.toHaveBeenCalled();
  });
});
