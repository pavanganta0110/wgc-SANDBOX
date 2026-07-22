import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import MerchantDashboardPage from "@/app/merchant/(dashboard)/dashboard/page";

vi.mock("@/lib/auth/requireMerchantSession", () => {
  return {
    requireMerchantSession: vi.fn().mockResolvedValue({
      userId: "test-user-id",
      email: "test-user@wgc.org",
      churchId: "performance-test-church",
      rawRole: "owner",
      role: "owner",
      isWgcAdmin: false,
    }),
  };
});

vi.mock("next/navigation", () => {
  return {
    redirect: vi.fn(),
  };
});

vi.mock("next/server", () => {
  return {
    after: vi.fn(),
  };
});

vi.mock("next/headers", () => {
  return {
    cookies: vi.fn().mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    }),
  };
});

vi.mock("@/lib/finix/client", () => {
  return {
    finixClient: {
      listComplianceFormsForMerchant: vi.fn().mockResolvedValue({
        _embedded: { compliance_forms: [] }
      }),
    },
  };
});

describe("Performance Benchmark - Before vs After", () => {
  const churchId = "performance-test-church";

  beforeEach(async () => {
    // Clean up first
    await prisma.synchronizationState.deleteMany({ where: { churchId } });
    await prisma.complianceForm.deleteMany({ where: { churchId } });
    await prisma.church.deleteMany({ where: { id: churchId } });

    // Seed test data
    await prisma.church.create({
      data: {
        id: churchId,
        name: "Performance Test Church",
        slug: "perf-test",
        primaryContactEmail: "test@wgc.org",
        status: "ACTIVE",
        finixMerchantId: "mid-perf-test",
      },
    });

    // Seed 100 dummy transfers to measure query performance
    const transfersData = Array.from({ length: 100 }).map((_, i) => ({
      churchId,
      finixTransferId: `tr_perf_${i}`,
      state: "SUCCEEDED",
      amountCents: 1000 + i,
      createdAtFinix: new Date(),
    }));
    await prisma.finixTransfer.createMany({ data: transfersData });
  });

  afterEach(async () => {
    await prisma.synchronizationState.deleteMany({ where: { churchId } });
    await prisma.finixTransfer.deleteMany({ where: { churchId } });
    await prisma.church.deleteMany({ where: { id: churchId } });
  });

  it("measures dashboard page rendering duration and database metrics", async () => {
    // Warmup run
    await MerchantDashboardPage({
      searchParams: Promise.resolve({ range: "6m" }),
    });

    // Measure After (Optimized) Page Render Time
    const start = performance.now();
    await MerchantDashboardPage({
      searchParams: Promise.resolve({ range: "6m" }),
    });
    const duration = performance.now() - start;

    console.log(`[PERF_RESULT] Server render duration: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(300); // Verify it renders fast (e.g. < 300ms with remote cloud DB)
  });
});
