import { describe, it, expect, vi, beforeEach } from "vitest";

let session: Record<string, unknown>;
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: async () => session }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
const loadYearTotals = vi.fn();
vi.mock("@/lib/donors/annualTotals", () => ({ loadYearTotals: (...a: unknown[]) => loadYearTotals(...a) }));
const statementFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { annualDonationStatement: { findMany: (...a: unknown[]) => statementFindMany(...a) } } }));
vi.mock("@/lib/donors/generateStatement", () => ({ renderCombinedStatementsPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")) }));

const row = (over: Record<string, unknown> = {}) => ({
  donorId: "d1", name: "Pat Lee", email: "pat@example.com", addressLine1: "12 Main St", addressLine2: null, city: "Dallas", state: "TX",
  postalCode: "75001", country: "US", addressStatus: "CONFIRMED", donationCount: 3, totalCents: 125050, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  session = { userId: "u1", email: "a@a.com", churchId: "churchA", rawRole: "owner", role: "owner", permissionsJson: null, authVersion: 1 };
});

describe("GET year-totals CSV", () => {
  it("exports name, mailing address, email and the year's total for the signed-in church only", async () => {
    loadYearTotals.mockResolvedValue([row(), row({ donorId: "d2", name: "=cmd|' /C calc'!A0", addressLine1: null, addressStatus: "MISSING", totalCents: 5000 })]);
    const { GET } = await import("@/app/api/merchant/donors/annual-statements/year-totals/route");
    const res = await GET(new Request("http://x/api?year=2025"));
    expect(res.status).toBe(200);
    expect(loadYearTotals).toHaveBeenCalledWith("churchA", 2025);
    expect(res.headers.get("Content-Disposition")).toContain("donor-giving-totals-2025.csv");
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM so Excel reads accents correctly
    const lines = (await res.text()).split("\r\n");
    expect(lines[0]).toBe("Donor Name,Address Line 1,Address Line 2,City,State,ZIP,Country,Email,Number of Gifts,Total Given,Address Status");
    expect(lines[1]).toBe("Pat Lee,12 Main St,,Dallas,TX,75001,US,pat@example.com,3,1250.50,CONFIRMED");
    expect(lines[2]).toContain("'=cmd"); // formula neutralized
  });

  it("can limit the export to donors who can be mailed", async () => {
    loadYearTotals.mockResolvedValue([row(), row({ donorId: "d2", addressLine1: null, addressStatus: "MISSING" })]);
    const { GET } = await import("@/app/api/merchant/donors/annual-statements/year-totals/route");
    const text = await (await GET(new Request("http://x/api?year=2025&mailableOnly=1"))).text();
    expect(text.trim().split("\r\n")).toHaveLength(2);
  });

  it("rejects a bad year and unauthorized roles", async () => {
    const { GET } = await import("@/app/api/merchant/donors/annual-statements/year-totals/route");
    expect((await GET(new Request("http://x/api?year=abc"))).status).toBe(400);
    session = { ...session, rawRole: "viewer", role: "viewer" };
    expect((await GET(new Request("http://x/api?year=2025"))).status).toBe(401);
  });
});

describe("GET combined-pdf", () => {
  const statements = [
    { id: "s2", donorNameSnapshot: "Zed", donorAddressSnapshot: { line1: "1 Elm" } },
    { id: "s1", donorNameSnapshot: "Amy", donorAddressSnapshot: { line1: "2 Oak" } },
    { id: "s3", donorNameSnapshot: "Bob", donorAddressSnapshot: null },
  ];

  it("counts only mailable statements and reports the number of downloadable parts", async () => {
    statementFindMany.mockResolvedValue(statements);
    const { GET } = await import("@/app/api/merchant/donors/annual-statements/combined-pdf/route");
    const meta = await (await GET(new Request("http://x/api?year=2025&meta=1"))).json();
    expect(meta).toMatchObject({ statements: 2, parts: 1 });
    expect(statementFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", taxYear: 2025, supersededAt: null });
  });

  it("returns a PDF sorted by donor name, one document for the whole run", async () => {
    statementFindMany.mockResolvedValue(statements);
    const gen = await import("@/lib/donors/generateStatement");
    const { GET } = await import("@/app/api/merchant/donors/annual-statements/combined-pdf/route");
    const res = await GET(new Request("http://x/api?year=2025"));
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(gen.renderCombinedStatementsPdf).toHaveBeenCalledWith(["s1", "s2"], "churchA");
  });

  it("tells the merchant to generate statements first when there is nothing to print", async () => {
    statementFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/merchant/donors/annual-statements/combined-pdf/route");
    expect((await GET(new Request("http://x/api?year=2025"))).status).toBe(404);
  });
});
