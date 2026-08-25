import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Item 35's #1 priority: "Merchant A can never retrieve Merchant B donor/
 * reporting data." queryDonorReport must derive churchId exclusively from
 * the authenticated session (auth.churchId) — never from anything in the
 * request body — and must apply resolveScopedDonorIds's fundraiser-scope
 * restriction when one is returned. Aggregate math itself is covered by
 * donorAggregates.ts's own test suite; this test isolates just the tenant/
 * scope boundary of the query construction, mocking everything below it.
 */

const mockDonorFindMany = vi.fn();
const mockDonorCount = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    donor: { findMany: (...args: unknown[]) => mockDonorFindMany(...args), count: (...args: unknown[]) => mockDonorCount(...args) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    externalDonation: { findMany: vi.fn().mockResolvedValue([]) },
    finixSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    givingLink: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

const mockResolveViewScope = vi.fn();
vi.mock("@/lib/auth/viewScope", () => ({ resolveViewScope: (...args: unknown[]) => mockResolveViewScope(...args) }));

const mockResolveScopedDonorIds = vi.fn();
const mockResolveScopedUserId = vi.fn();
vi.mock("@/lib/auth/scopes", () => ({
  resolveScopedDonorIds: (...args: unknown[]) => mockResolveScopedDonorIds(...args),
  resolveScopedUserId: (...args: unknown[]) => mockResolveScopedUserId(...args),
}));

vi.mock("@/lib/donors/donorAggregates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/donors/donorAggregates")>();
  return { ...actual, loadDonorAggregatesBatch: vi.fn().mockResolvedValue(new Map()) };
});
vi.mock("../aggregations", () => ({ loadPaymentMethodBreakdownBatch: vi.fn().mockResolvedValue(new Map()), EMPTY_BREAKDOWN: { cardGivingCents: 0, achGivingCents: 0, cashGivingCents: 0, checkGivingCents: 0, externalOtherGivingCents: 0, inKindValueCents: 0 } }));

function baseDefinition(overrides: Record<string, unknown> = {}) {
  return {
    reportType: "DONORS",
    dateRange: { key: "ytd" },
    sources: { card: true, ach: true, external: true, cash: true, check: true, inKind: true, recurring: true, oneTime: true, refunded: true, achReturns: false, failedPayments: false, anonymous: true },
    amountCalculation: "NET",
    columns: ["donorName", "email"],
    filters: {},
    sortBy: "DATE",
    sortDirection: "desc",
    page: 1,
    pageSize: 50,
    ...overrides,
  };
}

describe("queryDonorReport — tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDonorFindMany.mockResolvedValue([]);
    mockDonorCount.mockResolvedValue(0);
    mockResolveViewScope.mockResolvedValue({ kind: "organization" });
    mockResolveScopedDonorIds.mockResolvedValue(null);
    mockResolveScopedUserId.mockReturnValue(null);
  });

  it("scopes the donor query to the authenticated session's own churchId, never a value from the request body", async () => {
    const { queryDonorReport } = await import("../donorReport");
    const auth = { userId: "u1", email: "a@b.com", churchId: "church-A", rawRole: "owner", role: "owner", isWgcAdmin: false, permissionsJson: null, authVersion: 1 } as never;

    // Even if a caller tried to smuggle a different churchId into the
    // definition, ReportDefinition has no such field at all — the type
    // system itself makes this unrepresentable, which this test confirms
    // by never passing one and checking the resolved query used auth's.
    await queryDonorReport(auth, baseDefinition() as never);

    expect(mockDonorCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) }));
    expect(mockDonorFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A" }) }));
  });

  it("applies a fundraiser's donor-id scope restriction when resolveScopedDonorIds returns one, rather than querying org-wide", async () => {
    mockResolveScopedDonorIds.mockResolvedValue(["donor-1", "donor-2"]);
    const { queryDonorReport } = await import("../donorReport");
    const auth = { userId: "u2", email: "f@b.com", churchId: "church-A", rawRole: "fundraiser", role: "fundraiser", isWgcAdmin: false, permissionsJson: null, authVersion: 1 } as never;

    await queryDonorReport(auth, baseDefinition() as never);

    expect(mockDonorFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A", id: { in: ["donor-1", "donor-2"] } }) }));
  });

  it("does not scope by donor id when resolveScopedDonorIds returns null (organization-wide view)", async () => {
    mockResolveScopedDonorIds.mockResolvedValue(null);
    const { queryDonorReport } = await import("../donorReport");
    const auth = { userId: "u1", email: "a@b.com", churchId: "church-B", rawRole: "owner", role: "owner", isWgcAdmin: false, permissionsJson: null, authVersion: 1 } as never;

    await queryDonorReport(auth, baseDefinition() as never);

    const call = mockDonorFindMany.mock.calls[0][0];
    expect(call.where.churchId).toBe("church-B");
    expect(call.where.id).toBeUndefined();
  });
});
