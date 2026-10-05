import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = {
  jobRun: { findMany: vi.fn() },
  systemHealthEvent: { findMany: vi.fn() },
  systemIncident: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

function params(jobName: string) {
  return { params: Promise.resolve({ jobName }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.jobRun.findMany.mockResolvedValue([]);
  mockPrisma.systemHealthEvent.findMany.mockResolvedValue([]);
  mockPrisma.systemIncident.findUnique.mockResolvedValue(null);
});

describe("GET /api/admin/system-health/jobs/[jobName]", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("reconcile"));
    expect(res.status).toBe(401);
  });

  it("404s for a job name that isn't in the registry", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("not-a-real-job"));
    expect(res.status).toBe(404);
  });

  it("returns run history and retrySafe/critical flags for a known job", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.jobRun.findMany.mockResolvedValue([{ id: "run_1", status: "SUCCEEDED", startedAt: new Date(), completedAt: new Date() }]);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("release-settlement-queue"));
    const data = await res.json();
    expect(data.critical).toBe(true);
    expect(data.retrySafe).toBe(false);
    expect(data.runs).toHaveLength(1);
  });

  it("only attributes the Background Jobs incident to this job when it actually has a health event inside the incident's window — real evidence only", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const incidentStartedAt = new Date(Date.now() - 60 * 60 * 1000);
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ id: "inc_1", title: "Background Jobs Degraded", status: "OPEN", severity: "ERROR", startedAt: incidentStartedAt });

    // No related events at all for this job -> no evidence -> no attribution
    mockPrisma.systemHealthEvent.findMany.mockResolvedValue([]);
    const { GET } = await loadModule();
    const res1 = await GET(new Request("http://localhost"), params("invoice-reminders"));
    expect((await res1.json()).relatedIncident).toBeNull();

    // A related event that predates the incident's start -> still no evidence
    vi.resetModules();
    mockPrisma.systemHealthEvent.findMany.mockResolvedValue([{ id: "evt_1", createdAt: new Date(incidentStartedAt.getTime() - 60 * 60 * 1000), status: "FAILED", severity: "ERROR", message: "old", errorGroupId: null, wgcReference: null, requestId: null }]);
    const { GET: GET2 } = await loadModule();
    const res2 = await GET2(new Request("http://localhost"), params("invoice-reminders"));
    expect((await res2.json()).relatedIncident).toBeNull();

    // A related event within the incident's active window -> real evidence -> attributed
    vi.resetModules();
    mockPrisma.systemHealthEvent.findMany.mockResolvedValue([{ id: "evt_2", createdAt: new Date(), status: "FAILED", severity: "ERROR", message: "now", errorGroupId: null, wgcReference: null, requestId: null }]);
    const { GET: GET3 } = await loadModule();
    const res3 = await GET3(new Request("http://localhost"), params("invoice-reminders"));
    expect((await res3.json()).relatedIncident).toMatchObject({ id: "inc_1" });
  });
});
