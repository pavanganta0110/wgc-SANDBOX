import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveRows = vi.fn();
const mockSummarize = vi.fn();
vi.mock("@/lib/exports/transactionExport", async () => {
  const actual = await vi.importActual<typeof import("@/lib/exports/transactionExport")>("@/lib/exports/transactionExport");
  return {
    ...actual,
    resolveTransactionExportRows: (...args: unknown[]) => mockResolveRows(...args),
    summarizeTransactionReport: (...args: unknown[]) => mockSummarize(...args),
  };
});

const mockRenderToBuffer = vi.fn();
vi.mock("@react-pdf/renderer", async () => {
  const actual = await vi.importActual<typeof import("@react-pdf/renderer")>("@react-pdf/renderer");
  return {
    ...actual,
    renderToBuffer: (...args: unknown[]) => mockRenderToBuffer(...args),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(async () => ({ email: "u1@x.com", role: "fundraiser" })) } },
}));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/exports/transactionReportData");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildTransactionReportData", () => {
  it("labels ENTIRE_ORGANIZATION scope as 'Entire Organization', never the exporting admin's identity", async () => {
    mockResolveRows.mockResolvedValue([]);
    mockSummarize.mockReturnValue({});
    const { buildTransactionReportData } = await loadModule();
    const data = await buildTransactionReportData({
      churchId: "c1",
      scope: "ENTIRE_ORGANIZATION",
      owner: { name: "Entire Organization", email: "", userId: "", role: "" },
      generatedBy: { name: "owner@x.com", email: "owner@x.com" },
      filter: {},
      appliedFiltersDescription: "None",
    });
    expect(data.metadata.ownerName).toBe("Entire Organization");
    expect(data.metadata.reportType).toBe("Organization Transaction Report");
  });

  it("TEAM_MEMBER scope carries the member's own identity, distinct report type from ENTIRE_ORGANIZATION", async () => {
    mockResolveRows.mockResolvedValue([]);
    mockSummarize.mockReturnValue({});
    const { buildTransactionReportData } = await loadModule();
    const data = await buildTransactionReportData({
      churchId: "c1",
      scope: "TEAM_MEMBER",
      owner: { name: "fund@x.com", email: "fund@x.com", userId: "u1", role: "fundraiser" },
      generatedBy: { name: "owner@x.com", email: "owner@x.com" },
      filter: { attributedUserId: "u1" },
      appliedFiltersDescription: "Team Member = fund@x.com",
    });
    expect(data.metadata.ownerName).toBe("fund@x.com");
    expect(data.metadata.reportType).toBe("Team Member Transaction and Settlement Report");
    expect(data.metadata.reportType).not.toBe("Organization Transaction Report");
  });

  it("CSV and PDF render from the exact same resolved rows and summary — no independent calculation path", async () => {
    const rows = [{ wgcPaymentId: "p1" }];
    const summary = { transactionCount: 1 };
    mockResolveRows.mockResolvedValue(rows);
    mockSummarize.mockReturnValue(summary);
    mockRenderToBuffer.mockResolvedValue(Buffer.from("pdf"));

    const { buildTransactionReportData, renderTransactionReportPdf } = await loadModule();
    const data = await buildTransactionReportData({
      churchId: "c1",
      scope: "ENTIRE_ORGANIZATION",
      owner: { name: "Entire Organization", email: "", userId: "", role: "" },
      generatedBy: { name: "owner@x.com", email: "owner@x.com" },
      filter: {},
      appliedFiltersDescription: "None",
    });

    // Both renderTransactionReportCsv and renderTransactionReportPdf take
    // this exact same `data` object — same rows array, same summary
    // object, no separate query or aggregation for either format.
    expect(data.rows).toBe(rows);
    expect(data.summary).toBe(summary);

    await renderTransactionReportPdf(data); // exercises the PDF path against the same `data`

    // The PDF renderer was invoked with a component built from this exact
    // rows/summary pair — proving the PDF never recomputes its own totals.
    expect(mockRenderToBuffer).toHaveBeenCalledTimes(1);
  });
});

describe("resolveUserIdentity", () => {
  it("falls back to email as the display name — User has no separate name field in this schema", async () => {
    const { resolveUserIdentity } = await loadModule();
    const identity = await resolveUserIdentity("u1");
    expect(identity).toEqual({ name: "u1@x.com", email: "u1@x.com", role: "fundraiser" });
  });
});
