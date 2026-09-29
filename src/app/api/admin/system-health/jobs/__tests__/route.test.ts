import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = { jobRun: { findFirst: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.jobRun.findFirst.mockResolvedValue(null);
});

describe("GET /api/admin/system-health/jobs", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lists every configured job, including aplos-sync (not yet scheduled)", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { GET } = await loadModule();
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    const names = data.jobs.map((j: { jobName: string }) => j.jobName);
    expect(names).toContain("aplos-sync");
    expect(names).toContain("reconcile");
    const aplos = data.jobs.find((j: { jobName: string }) => j.jobName === "aplos-sync");
    expect(aplos.activelyScheduled).toBe(false);
    expect(aplos.status).toBe("NEVER_RUN");
  });

  it("never marks release-settlement-queue as retry-safe in the list response", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { GET } = await loadModule();
    const res = await GET();
    const data = await res.json();
    const releaseQueue = data.jobs.find((j: { jobName: string }) => j.jobName === "release-settlement-queue");
    expect(releaseQueue.retrySafe).toBe(false);
  });

  it("sorts critical failures ahead of non-critical ones, and both ahead of healthy jobs", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.jobRun.findFirst.mockImplementation(({ where }: { where: { jobName: string; status?: string } }) => {
      if (where.jobName === "reconcile" && where.status === undefined) return Promise.resolve({ id: "run_crit", status: "FAILED", startedAt: new Date(), completedAt: null });
      if (where.jobName === "invoice-reminders" && where.status === undefined) return Promise.resolve({ id: "run_noncrit", status: "FAILED", startedAt: new Date(), completedAt: null });
      return Promise.resolve(null);
    });
    const { GET } = await loadModule();
    const res = await GET();
    const data = await res.json();
    const reconcileIdx = data.jobs.findIndex((j: { jobName: string }) => j.jobName === "reconcile");
    const invoiceIdx = data.jobs.findIndex((j: { jobName: string }) => j.jobName === "invoice-reminders");
    expect(reconcileIdx).toBeLessThan(invoiceIdx);
  });
});
