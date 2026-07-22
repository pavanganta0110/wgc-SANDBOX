import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));

const mockViewScope = vi.fn();
vi.mock("@/lib/auth/viewScope", () => ({
  resolveViewScope: (...args: unknown[]) => mockViewScope(...args),
}));

const mockScopedUserId = vi.fn();
vi.mock("@/lib/auth/scopes", () => ({
  resolveScopedUserId: (...args: unknown[]) => mockScopedUserId(...args),
}));

const mockBuildReportData = vi.fn();
const mockRenderCsv = vi.fn();
const mockRenderPdf = vi.fn();
const mockResolveUserIdentity = vi.fn();
vi.mock("@/lib/exports/transactionReportData", () => ({
  buildTransactionReportData: (...args: unknown[]) => mockBuildReportData(...args),
  renderTransactionReportCsv: (...args: unknown[]) => mockRenderCsv(...args),
  renderTransactionReportPdf: (...args: unknown[]) => mockRenderPdf(...args),
  resolveUserIdentity: (...args: unknown[]) => mockResolveUserIdentity(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/transactions/payments/export/route");
}

function req(qs = "") {
  return new Request(`http://x/api/merchant/transactions/payments/export${qs}`);
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    donorName: "Jane Doe",
    lastFour: "4242",
    transactionStatus: "SUCCEEDED",
    refundStatus: "NONE",
    fundName: "General Fund",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", email: "owner@a.com" });
  mockViewScope.mockResolvedValue({ effective: { kind: "organization" } });
  mockScopedUserId.mockReturnValue(null);
  mockRenderCsv.mockReturnValue("csv,content");
  mockRenderPdf.mockResolvedValue(Buffer.from("pdf"));
});

describe("GET /api/merchant/transactions/payments/export — Fund / Designation filter", () => {
  it("'General Fund' keeps only rows whose fundName is General Fund", async () => {
    mockBuildReportData.mockResolvedValue({
      rows: [row({ fundName: "General Fund" }), row({ fundName: "Staff Fund" })],
      summary: {},
    });
    const { GET } = await loadModule();
    await GET(req("?fund=General%20Fund"));

    const filteredRows = mockRenderCsv.mock.calls[0][0].rows;
    expect(filteredRows).toHaveLength(1);
    expect(filteredRows[0].fundName).toBe("General Fund");
  });

  it("matches case-insensitively", async () => {
    mockBuildReportData.mockResolvedValue({ rows: [row({ fundName: "General Fund" })], summary: {} });
    const { GET } = await loadModule();
    await GET(req("?fund=general%20fund"));

    expect(mockRenderCsv.mock.calls[0][0].rows).toHaveLength(1);
  });

  it("supports partial text matching", async () => {
    mockBuildReportData.mockResolvedValue({ rows: [row({ fundName: "Building Fund" })], summary: {} });
    const { GET } = await loadModule();
    await GET(req("?fund=build"));

    expect(mockRenderCsv.mock.calls[0][0].rows).toHaveLength(1);
  });

  it("a payment with no fund never matches a fund search (shows as Unspecified elsewhere, not a match)", async () => {
    mockBuildReportData.mockResolvedValue({ rows: [row({ fundName: "" })], summary: {} });
    const { GET } = await loadModule();
    await GET(req("?fund=general"));

    expect(mockRenderCsv.mock.calls[0][0].rows).toHaveLength(0);
  });

  it("report metadata (appliedFiltersDescription) reflects the applied fund filter", async () => {
    mockBuildReportData.mockResolvedValue({ rows: [], summary: {} });
    const { GET } = await loadModule();
    await GET(req("?fund=Missions"));

    expect(mockBuildReportData).toHaveBeenCalledWith(
      expect.objectContaining({ appliedFiltersDescription: expect.stringContaining("fund=Missions") })
    );
  });

  it("PDF export applies the same fund filter as CSV", async () => {
    mockBuildReportData.mockResolvedValue({
      rows: [row({ fundName: "General Fund" }), row({ fundName: "Youth Ministry" })],
      summary: {},
    });
    const { GET } = await loadModule();
    await GET(req("?fund=Youth&format=pdf"));

    expect(mockRenderPdf.mock.calls[0][0].rows).toHaveLength(1);
    expect(mockRenderPdf.mock.calls[0][0].rows[0].fundName).toBe("Youth Ministry");
  });

  it("underlying rows are already scoped server-side via buildTransactionReportData's attributedUserId filter — export never widens scope", async () => {
    mockScopedUserId.mockReturnValue("fundraiser-1");
    mockResolveUserIdentity.mockResolvedValue({ name: "Fund Raiser", email: "fr@a.com", role: "fundraiser" });
    mockBuildReportData.mockResolvedValue({ rows: [], summary: {} });
    const { GET } = await loadModule();
    await GET(req("?fund=General"));

    expect(mockBuildReportData).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "church-a", filter: expect.objectContaining({ attributedUserId: "fundraiser-1" }) })
    );
  });

  it("existing filters (last4, buyer, state) continue working alongside the fund filter", async () => {
    mockBuildReportData.mockResolvedValue({
      rows: [
        row({ fundName: "General Fund", lastFour: "4242", donorName: "Jane Doe", transactionStatus: "SUCCEEDED" }),
        row({ fundName: "General Fund", lastFour: "9999", donorName: "Jane Doe", transactionStatus: "SUCCEEDED" }),
      ],
      summary: {},
    });
    const { GET } = await loadModule();
    await GET(req("?fund=General&last4=4242"));

    const filteredRows = mockRenderCsv.mock.calls[0][0].rows;
    expect(filteredRows).toHaveLength(1);
    expect(filteredRows[0].lastFour).toBe("4242");
  });
});
