import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import MerchantDashboardPage from "@/app/merchant/(dashboard)/dashboard/page";

/**
 * Guardrail against the exact regression this file exists to prevent: the
 * merchant dashboard used to fetch every matching transaction row
 * (findMany, no `take`) and reduce them in JavaScript. That's fast against
 * a handful of test rows and gets steadily slower as an organization's real
 * transaction history grows — which is what actually happened in
 * production. See src/lib/reports/dashboardAggregates.ts for the fix
 * (database-side aggregation).
 *
 * This test proves the fix by seeding a LARGE dataset and asserting the
 * page's load time stays flat and bounded regardless of row count — the
 * old implementation would fail this test badly (transferring tens of
 * thousands of rows over the wire and reducing them in Node scales with N;
 * a handful of small indexed aggregate queries does not). If someone
 * reintroduces an unbounded findMany + JS reduce anywhere in the dashboard's
 * data loading, this test is the mechanism that catches it before it ships.
 */

vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: vi.fn().mockResolvedValue({
    userId: "scale-test-user",
    email: "scale-test@wgc.org",
    churchId: "scale-regression-church",
    rawRole: "owner",
    role: "owner",
    isWgcAdmin: false,
  }),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) }),
}));

const churchId = "scale-regression-church";

// Large enough that any O(rows) behavior — full-row fetch, or a JS reduce
// over the whole result set — would be unmistakably, not just marginally,
// slower. Real WGC merchants can accumulate this much history over a few
// years of steady giving.
const LARGE_ROW_COUNT = 20_000;

function makeTransfers(count: number, offsetDays = 0) {
  const now = Date.now();
  return Array.from({ length: count }).map((_, i) => ({
    churchId,
    finixTransferId: `scale_tr_${offsetDays}_${i}`,
    state: i % 5 === 0 ? "FAILED" : "SUCCEEDED",
    amountCents: 1000 + (i % 500),
    // Spread across the last ~6 months so both the summary (6m default
    // range) and the trend buckets (last 14 days) have real rows to match
    // against, not just a single instant.
    createdAtFinix: new Date(now - (i % 180) * 24 * 60 * 60 * 1000),
  }));
}

describe("Merchant dashboard — load time does not scale with transaction volume", () => {
  beforeAll(async () => {
    await prisma.finixTransfer.deleteMany({ where: { churchId } });
    await prisma.church.deleteMany({ where: { id: churchId } });
    await prisma.church.create({
      data: {
        id: churchId,
        name: "Scale Regression Test Church",
        slug: "scale-regression-test",
        primaryContactEmail: "scale-test@wgc.org",
        status: "ACTIVE",
        finixMerchantId: "mid-scale-regression-test",
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.finixTransfer.deleteMany({ where: { churchId } });
    await prisma.church.deleteMany({ where: { id: churchId } });
  }, 30_000);

  it("stays fast at a small row count, then stays just as fast after seeding 20,000 more rows", async () => {
    // --- Small scale ---
    await prisma.finixTransfer.createMany({ data: makeTransfers(200) });

    await MerchantDashboardPage({ searchParams: Promise.resolve({ range: "6m" }) }); // warm-up
    const smallStart = performance.now();
    await MerchantDashboardPage({ searchParams: Promise.resolve({ range: "6m" }) });
    const smallDuration = performance.now() - smallStart;

    // --- Large scale: 100x the row count ---
    await prisma.finixTransfer.createMany({ data: makeTransfers(LARGE_ROW_COUNT, 1) });

    await MerchantDashboardPage({ searchParams: Promise.resolve({ range: "6m" }) }); // warm-up
    const largeStart = performance.now();
    await MerchantDashboardPage({ searchParams: Promise.resolve({ range: "6m" }) });
    const largeDuration = performance.now() - largeStart;

    console.log(
      `[SCALE_REGRESSION] 200 rows: ${smallDuration.toFixed(0)}ms, ${LARGE_ROW_COUNT + 200} rows: ${largeDuration.toFixed(0)}ms`
    );

    // Absolute budget: generous for this environment's real network latency
    // to a remote database, but far below what transferring 20,000+ full
    // rows and reducing them in JS would take.
    expect(largeDuration).toBeLessThan(3000);

    // Relative budget: the actual regression signal. Aggregate queries are
    // bounded by index-range lookups, not row count, so 100x the data
    // should not produce a proportional slowdown. A generous 4x allowance
    // absorbs normal network jitter while still catching an O(rows) revert,
    // which would show up as one or two orders of magnitude, not 4x.
    expect(largeDuration).toBeLessThan(Math.max(smallDuration * 4, 800));
  }, 60_000);
});
