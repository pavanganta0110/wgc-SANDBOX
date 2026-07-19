import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));

const mockSummary = vi.fn();
vi.mock("@/lib/settings/teamMemberDetail", () => ({
  loadTeamMemberSummary: (...args: unknown[]) => mockSummary(...args),
}));

const mockBuildReportData = vi.fn();
const mockRenderCsv = vi.fn();
const mockRenderPdf = vi.fn();
vi.mock("@/lib/exports/transactionReportData", () => ({
  buildTransactionReportData: (...args: unknown[]) => mockBuildReportData(...args),
  renderTransactionReportCsv: (...args: unknown[]) => mockRenderCsv(...args),
  renderTransactionReportPdf: (...args: unknown[]) => mockRenderPdf(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/settings/team/[userId]/export/route");
}

function req(qs = "") {
  return new Request(`http://x/api/merchant/settings/team/user-2/export${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/merchant/settings/team/[userId]/export", () => {
  it("OWNER can export another team member's scoped CSV, filtered by attributedUserId", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner", email: "owner@church-a.com" });
    mockSummary.mockResolvedValue({ userId: "user-2", email: "fund@church-a.com", role: "fundraiser" });
    mockBuildReportData.mockResolvedValue({ rows: [], summary: {} });
    mockRenderCsv.mockReturnValue("csv,content");

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(200);
    expect(mockBuildReportData).toHaveBeenCalledWith(
      expect.objectContaining({
        churchId: "church-a",
        scope: "TEAM_MEMBER",
        filter: { attributedUserId: "user-2" },
      })
    );
  });

  it("FUNDRAISER cannot export another team member's data", async () => {
    mockAuth.mockResolvedValue({ userId: "fund-1", churchId: "church-a", rawRole: "fundraiser", role: "fundraiser", email: "fund-1@church-a.com" });
    mockSummary.mockResolvedValue({ userId: "user-2", email: "other@church-a.com", role: "fundraiser" });

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(401);
    expect(mockBuildReportData).not.toHaveBeenCalled();
  });

  it("cross-church userId is rejected (loader returns null, treated as not found)", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner", email: "owner@church-a.com" });
    mockSummary.mockResolvedValue(null);

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-in-other-church" }) });
    expect(res.status).toBe(404);
    expect(mockBuildReportData).not.toHaveBeenCalled();
  });

  it("requests the CSV renderer by default and the PDF renderer with ?format=pdf", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner", email: "owner@church-a.com" });
    mockSummary.mockResolvedValue({ userId: "user-2", email: "fund@church-a.com", role: "fundraiser" });
    mockBuildReportData.mockResolvedValue({ rows: [], summary: {} });
    mockRenderCsv.mockReturnValue("csv,content");
    mockRenderPdf.mockResolvedValue(Buffer.from("pdf-bytes"));

    const { GET } = await loadModule();

    const csvRes = await GET(req(), { params: Promise.resolve({ userId: "user-2" }) });
    expect(csvRes.headers.get("Content-Type")).toBe("text/csv");
    expect(mockRenderPdf).not.toHaveBeenCalled();

    const pdfRes = await GET(req("?format=pdf"), { params: Promise.resolve({ userId: "user-2" }) });
    expect(pdfRes.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockRenderCsv).toHaveBeenCalledTimes(1); // not called again for the PDF request
  });

  it("uses the sanitized, consistent wgc-team-member-transaction-settlement-report file name", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner", email: "owner@church-a.com" });
    mockSummary.mockResolvedValue({ userId: "user-2", email: "fund@church-a.com", role: "fundraiser" });
    mockBuildReportData.mockResolvedValue({ rows: [], summary: {} });
    mockRenderCsv.mockReturnValue("csv,content");

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-2" }) });
    const disposition = res.headers.get("Content-Disposition") || "";
    expect(disposition).toContain("wgc-team-member-transaction-settlement-report-fund_church-a_com-");
    expect(disposition).not.toContain("fund@church-a.com"); // raw email never used as-is in the filename
  });
});
