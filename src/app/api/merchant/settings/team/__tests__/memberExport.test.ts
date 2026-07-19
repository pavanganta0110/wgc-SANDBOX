import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));

const mockSummary = vi.fn();
const mockTransactions = vi.fn();
vi.mock("@/lib/settings/teamMemberDetail", () => ({
  loadTeamMemberSummary: (...args: unknown[]) => mockSummary(...args),
  loadTeamMemberTransactions: (...args: unknown[]) => mockTransactions(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/settings/team/[userId]/export/route");
}

function req() {
  return new Request("http://x/api/merchant/settings/team/user-2/export");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/merchant/settings/team/[userId]/export", () => {
  it("OWNER can export another team member's scoped CSV", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner" });
    mockSummary.mockResolvedValue({ userId: "user-2", email: "fund@church-a.com" });
    mockTransactions.mockResolvedValue([
      {
        paymentId: "p1",
        finixTransferId: "tr-1",
        createdAt: new Date("2026-01-01"),
        donorName: "Jane Doe",
        givingLinkName: "Spring Drive",
        paymentMethodType: "CARD",
        amountCents: 5000,
        feeCents: 175,
        refundedCents: 0,
        netCents: 5000,
        status: "SUCCEEDED",
        settlementId: "stl-1",
        settlementState: "SETTLED",
        settledAt: new Date("2026-01-03"),
      },
    ]);

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("fund@church-a.com");
    expect(csv).toContain("Jane Doe");
    expect(csv).not.toContain("owner-1"); // exporting admin's own identity never leaks into the target's rows
  });

  it("FUNDRAISER cannot export another team member's data", async () => {
    mockAuth.mockResolvedValue({ userId: "fund-1", churchId: "church-a", rawRole: "fundraiser", role: "fundraiser" });
    mockSummary.mockResolvedValue({ userId: "user-2", email: "other@church-a.com" });

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-2" }) });
    expect(res.status).toBe(401);
    expect(mockTransactions).not.toHaveBeenCalled();
  });

  it("cross-church userId is rejected (loader returns null, treated as not found)", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner" });
    mockSummary.mockResolvedValue(null);

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-in-other-church" }) });
    expect(res.status).toBe(404);
    expect(mockTransactions).not.toHaveBeenCalled();
  });

  it("exported CSV never includes card/bank numbers or raw tokens — only the fixed non-sensitive column set", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner" });
    mockSummary.mockResolvedValue({ userId: "user-2", email: "fund@church-a.com" });
    mockTransactions.mockResolvedValue([
      {
        paymentId: "p1",
        finixTransferId: "tr-1",
        createdAt: new Date("2026-01-01"),
        donorName: "Jane Doe",
        givingLinkName: "Spring Drive",
        paymentMethodType: "CARD",
        amountCents: 5000,
        feeCents: 175,
        refundedCents: 0,
        netCents: 5000,
        status: "SUCCEEDED",
        settlementId: "stl-1",
        settlementState: "SETTLED",
        settledAt: new Date("2026-01-03"),
      },
    ]);

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-2" }) });
    const csv = await res.text();
    const header = csv.split("\n")[0];
    expect(header).toBe(
      "Member Email,Giving Link,Transaction ID,Finix Transfer ID,Donation Date,Donor Name,Payment Method,Gross Amount,Fee Amount,Refund Amount,Net Amount,Status,Settlement ID,Settlement Status"
    );
  });

  it("includes the processing fee and the settlement the money was deposited in", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", churchId: "church-a", rawRole: "owner", role: "owner" });
    mockSummary.mockResolvedValue({ userId: "user-2", email: "fund@church-a.com" });
    mockTransactions.mockResolvedValue([
      {
        paymentId: "p1",
        finixTransferId: "tr-1",
        createdAt: new Date("2026-01-01"),
        donorName: "Jane Doe",
        givingLinkName: "Spring Drive",
        paymentMethodType: "CARD",
        amountCents: 5000,
        feeCents: 175,
        refundedCents: 0,
        netCents: 5000,
        status: "SUCCEEDED",
        settlementId: "stl-1",
        settlementState: "SETTLED",
        settledAt: new Date("2026-01-03"),
      },
    ]);

    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ userId: "user-2" }) });
    const csv = await res.text();
    expect(csv).toContain("$1.75"); // fee
    expect(csv).toContain("stl-1"); // settlement id
    expect(csv).toContain("SETTLED");
  });
});
