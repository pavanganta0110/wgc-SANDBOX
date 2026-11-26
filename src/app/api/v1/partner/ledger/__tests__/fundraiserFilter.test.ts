import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/partners/partnerApiAuth", () => {
  const wrap = (handler: (req: Request, auth: { partnerKeyId: string; partnerId: string; partnerType: string }, requestId: string) => Promise<Response>) => async (req: Request) =>
    handler(req, { partnerKeyId: "k1", partnerId: "p1", partnerType: "SOFTWARE" }, "req_1");
  return { withPartnerApiAuth: wrap, withSoftwarePartnerApiAuth: wrap };
});
const loader = vi.hoisted(() => ({ loadPartnerLedgerPage: vi.fn(), resolveLedgerFundraiserFilter: vi.fn(), decodePartnerLedgerCursor: vi.fn() }));
vi.mock("@/lib/ledger/loadLedger", () => loader);
const orgs = vi.hoisted(() => ({ loadPartnerApiOrganizations: vi.fn(), pickPartnerOrganization: vi.fn() }));
vi.mock("@/lib/partners/loadPartnerApiOrganizations", () => orgs);

import { GET } from "../route";

const get = (q: string) => GET(new Request(`https://wgc.test/api/v1/partner/ledger?from=2026-01-01&to=2026-02-01${q}`));

beforeEach(() => {
  vi.clearAllMocks();
  orgs.loadPartnerApiOrganizations.mockResolvedValue([{ id: "c1", name: "Grace", reference: "loc_1" }]);
  loader.loadPartnerLedgerPage.mockResolvedValue({ rows: [], nextCursor: null });
  loader.resolveLedgerFundraiserFilter.mockResolvedValue({ kind: "none" });
});

describe("GET /api/v1/partner/ledger ?fundraiser=", () => {
  it("passes no filter when the parameter is absent", async () => {
    await get("");
    expect(loader.resolveLedgerFundraiserFilter).not.toHaveBeenCalled();
    expect(loader.loadPartnerLedgerPage.mock.calls[0][0].fundraiser).toBeNull();
  });

  it("resolves the value among the key's own organizations only, and passes the filter on", async () => {
    loader.resolveLedgerFundraiserFilter.mockResolvedValue({ kind: "users", ids: ["u1"] });
    const res = await get("&fundraiser=ada@x.co");
    expect(res.status).toBe(200);
    expect(loader.resolveLedgerFundraiserFilter).toHaveBeenCalledWith(["c1"], "ada@x.co");
    expect(loader.loadPartnerLedgerPage.mock.calls[0][0].fundraiser).toEqual({ kind: "users", ids: ["u1"] });
  });

  it("narrows to one organization first, then resolves the person inside it", async () => {
    orgs.pickPartnerOrganization.mockReturnValue({ id: "c1", name: "Grace", reference: "loc_1" });
    await get("&organization=loc_1&fundraiser=none");
    expect(loader.resolveLedgerFundraiserFilter).toHaveBeenCalledWith(["c1"], "none");
  });

  it("refuses an empty or oversized value", async () => {
    expect((await get("&fundraiser=")).status).toBe(400);
    expect((await get(`&fundraiser=${"a".repeat(300)}`)).status).toBe(400);
    expect(loader.loadPartnerLedgerPage).not.toHaveBeenCalled();
  });
});
