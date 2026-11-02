import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));
vi.mock("@/lib/auth/viewScope", () => ({
  resolveViewScope: async () => ({ effective: { kind: "organization" } }),
}));
const mockPaymentScope = vi.fn();
const mockTransferScope = vi.fn();
vi.mock("@/lib/auth/scopes", () => ({
  resolveScopedUserId: () => null,
  buildPaymentScope: (...args: unknown[]) => mockPaymentScope(...args),
  buildFinixTransferScope: async (...args: unknown[]) => mockTransferScope(...args),
}));
const mockSearch = vi.fn();
vi.mock("@/lib/payments/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/search")>()),
  resolveSearchMatchedTransferIds: (...args: unknown[]) => mockSearch(...args),
}));
const mockBuildReportData = vi.fn();
const mockRenderCsv = vi.fn();
vi.mock("@/lib/exports/transactionReportData", () => ({
  buildTransactionReportData: (...args: unknown[]) => mockBuildReportData(...args),
  renderTransactionReportCsv: (...args: unknown[]) => mockRenderCsv(...args),
  renderTransactionReportPdf: vi.fn(),
  resolveUserIdentity: vi.fn(),
}));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/transactions/payments/export/route");
}

const row = (finixTransferId: string) => ({
  finixTransferId,
  donorName: "Jane Doe",
  lastFour: "4242",
  transactionStatus: "SUCCEEDED",
  refundStatus: "NONE",
  fundName: "",
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", email: "owner@a.com" });
  mockPaymentScope.mockReturnValue({ churchId: "church-a" });
  mockTransferScope.mockReturnValue({ churchId: "church-a" });
  mockRenderCsv.mockReturnValue("csv");
});

describe("GET /api/merchant/transactions/payments/export — search filter", () => {
  it("keeps only the rows the search matched, resolved under the session's own scopes", async () => {
    mockSearch.mockResolvedValue(["TR_2"]);
    mockBuildReportData.mockResolvedValue({ rows: [row("TR_1"), row("TR_2"), row("TR_3")], summary: {} });
    const { GET } = await loadModule();
    await GET(new Request("http://x/api/merchant/transactions/payments/export?q=S-100"));

    expect(mockRenderCsv.mock.calls[0][0].rows.map((r: { finixTransferId: string }) => r.finixTransferId)).toEqual(["TR_2"]);
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "church-a", paymentScope: { churchId: "church-a" }, transferScope: { churchId: "church-a" }, query: "S-100" })
    );
  });

  it("records the search in the report's applied filters", async () => {
    mockSearch.mockResolvedValue([]);
    mockBuildReportData.mockResolvedValue({ rows: [], summary: {} });
    const { GET } = await loadModule();
    await GET(new Request("http://x/api/merchant/transactions/payments/export?q=Jane"));
    expect(mockBuildReportData).toHaveBeenCalledWith(
      expect.objectContaining({ appliedFiltersDescription: expect.stringContaining("search=Jane") })
    );
  });

  it("does not search at all when no query is given", async () => {
    mockBuildReportData.mockResolvedValue({ rows: [row("TR_1")], summary: {} });
    const { GET } = await loadModule();
    await GET(new Request("http://x/api/merchant/transactions/payments/export"));
    expect(mockSearch).not.toHaveBeenCalled();
    expect(mockRenderCsv.mock.calls[0][0].rows).toHaveLength(1);
  });
});
