import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  apiRequestLog: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockLoadLedgerRows = vi.fn();
vi.mock("@/lib/ledger/loadLedger", () => ({ LEDGER_MAX_ROWS: 10_000, loadLedgerRows: mockLoadLedgerRows }));

function req(query: string, authHeader = "Bearer wgc_live_valid") {
  return new Request(`http://x/api/v1/ledger${query}`, { method: "GET", headers: new Headers({ authorization: authHeader }) });
}

const emptyCtx = () => ({ params: Promise.resolve({}) });
const goodQuery = "?from=2026-01-01&to=2027-01-01";

describe("GET /api/v1/ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "ACTIVE", scopesJson: ["donations:read"] });
    mockLoadLedgerRows.mockResolvedValue({ rows: [], truncated: false });
  });

  it("returns 401 for an invalid key without reading the ledger", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);
    const { GET } = await import("../route");

    const res = await GET(req(goodQuery), emptyCtx());

    expect(res.status).toBe(401);
    expect(mockLoadLedgerRows).not.toHaveBeenCalled();
  });

  it("returns 403 when the key lacks the donations:read scope", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "k1", churchId: "church-a", status: "ACTIVE", scopesJson: ["donors:read"] });
    const { GET } = await import("../route");

    const res = await GET(req(goodQuery), emptyCtx());

    expect(res.status).toBe(403);
    expect(mockLoadLedgerRows).not.toHaveBeenCalled();
  });

  it("reads only the key's own church, ignoring any churchId in the query", async () => {
    const { GET } = await import("../route");

    const res = await GET(req(`${goodQuery}&churchId=church-b-attempted-injection`), emptyCtx());

    expect(res.status).toBe(200);
    expect(mockLoadLedgerRows).toHaveBeenCalledWith(expect.objectContaining({ churchId: "church-a" }));
  });

  it("passes the window through with from inclusive and to exclusive, and returns rows with a count", async () => {
    mockLoadLedgerRows.mockResolvedValue({ rows: [{ id: "p1" }, { id: "p2" }], truncated: false });
    const { GET } = await import("../route");

    const res = await GET(req(goodQuery), emptyCtx());
    const body = await res.json();

    expect(mockLoadLedgerRows).toHaveBeenCalledWith({ churchId: "church-a", from: new Date("2026-01-01"), to: new Date("2027-01-01") });
    expect(body.data).toHaveLength(2);
    expect(body.count).toBe(2);
    expect(body.from).toBe("2026-01-01T00:00:00.000Z");
    expect(body.to).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rejects a missing or unparseable from/to with 400", async () => {
    const { GET } = await import("../route");

    expect((await GET(req(""), emptyCtx())).status).toBe(400);
    expect((await GET(req("?from=2026-01-01"), emptyCtx())).status).toBe(400);
    expect((await GET(req("?from=not-a-date&to=2027-01-01"), emptyCtx())).status).toBe(400);
    expect(mockLoadLedgerRows).not.toHaveBeenCalled();
  });

  it("rejects a window where from is not before to", async () => {
    const { GET } = await import("../route");

    expect((await GET(req("?from=2026-06-01&to=2026-06-01"), emptyCtx())).status).toBe(400);
    expect((await GET(req("?from=2026-06-02&to=2026-06-01"), emptyCtx())).status).toBe(400);
  });

  it("allows a full calendar year but rejects a window longer than 366 days", async () => {
    const { GET } = await import("../route");

    expect((await GET(req("?from=2026-01-01&to=2027-01-01"), emptyCtx())).status).toBe(200);
    expect((await GET(req("?from=2026-01-01&to=2027-03-01"), emptyCtx())).status).toBe(400);
  });

  it("returns 400 with the row limit when the window holds more gifts than the cap", async () => {
    mockLoadLedgerRows.mockResolvedValue({ rows: [], truncated: true });
    const { GET } = await import("../route");

    const res = await GET(req(goodQuery), emptyCtx());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.type).toBe("validation_error");
    expect(body.error.rowLimit).toBe(10_000);
  });
});
