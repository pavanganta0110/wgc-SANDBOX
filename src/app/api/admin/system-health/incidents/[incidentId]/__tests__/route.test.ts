import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = {
  systemIncident: { findUnique: vi.fn(), update: vi.fn() },
  systemHealthEvent: { findMany: vi.fn(), groupBy: vi.fn() },
  church: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

function params(incidentId: string) {
  return { params: Promise.resolve({ incidentId }) };
}

const BASE_INCIDENT = {
  id: "inc_1",
  fingerprint: "Finix:degraded",
  title: "Finix Payment Processing Degraded",
  description: "high failure rate",
  service: "Finix",
  severity: "CRITICAL",
  status: "OPEN",
  startedAt: new Date("2026-01-01T00:00:00Z"),
  lastSeenAt: new Date("2026-01-01T01:00:00Z"),
  resolvedAt: null,
  occurrenceCount: 5,
  affectedMerchantCount: 2,
  affectedUserCount: 0,
  sentryIssueUrl: null,
  notes: null,
  errorGroups: [],
  alerts: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemHealthEvent.findMany.mockResolvedValue([]);
  mockPrisma.systemHealthEvent.groupBy.mockResolvedValue([]);
  mockPrisma.church.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/system-health/incidents/[incidentId]", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("inc_1"));
    expect(res.status).toBe(401);
  });

  it("404s for an incident that doesn't exist", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemIncident.findUnique.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("missing"));
    expect(res.status).toBe(404);
  });

  it("builds a timeline from the incident's own lifecycle plus every alert sent, in chronological order", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemIncident.findUnique.mockResolvedValue({
      ...BASE_INCIDENT,
      resolvedAt: new Date("2026-01-01T03:00:00Z"),
      alerts: [{ id: "a1", severity: "CRITICAL", channel: "EMAIL", notificationType: "INITIAL", recipient: "ops@wgc.com", deliveryStatus: "SENT", failureReason: null, sentAt: new Date("2026-01-01T00:05:00Z") }],
    });
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("inc_1"));
    const data = await res.json();
    expect(data.timeline.map((t: { type: string }) => t.type)).toEqual(["CREATED", "ALERT_SENT", "RESOLVED"]);
  });

  it("only lists relatedJobs for the Background Jobs incident, never for a service incident", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ ...BASE_INCIDENT, service: "Finix" });
    mockPrisma.systemHealthEvent.findMany.mockResolvedValue([{ id: "e1", createdAt: new Date(), operation: "reconcile", status: "FAILED", severity: "ERROR", merchantId: null, message: "x", requestId: null, wgcReference: null }]);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("inc_1"));
    const data = await res.json();
    expect(data.relatedJobs).toEqual([]);
  });
});

describe("PATCH /api/admin/system-health/incidents/[incidentId]", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { PATCH } = await loadModule();
    const res = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "IGNORED" }) }), params("inc_1"));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid status value", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { PATCH } = await loadModule();
    const res = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "NOT_A_STATUS" }) }), params("inc_1"));
    expect(res.status).toBe(400);
    expect(mockPrisma.systemIncident.update).not.toHaveBeenCalled();
  });

  it("lets an admin manually mark an incident IGNORED — the one status the automatic engine never sets itself", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemIncident.update.mockResolvedValue({ ...BASE_INCIDENT, status: "IGNORED" });
    const { PATCH } = await loadModule();
    const res = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "IGNORED" }) }), params("inc_1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.systemIncident.update).toHaveBeenCalledWith({ where: { id: "inc_1" }, data: { status: "IGNORED", resolvedAt: null } });
  });

  it("sets resolvedAt when manually marking an incident RESOLVED", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemIncident.update.mockResolvedValue({ ...BASE_INCIDENT, status: "RESOLVED" });
    const { PATCH } = await loadModule();
    await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) }), params("inc_1"));
    const data = mockPrisma.systemIncident.update.mock.calls[0][0].data;
    expect(data.status).toBe("RESOLVED");
    expect(data.resolvedAt).toBeInstanceOf(Date);
  });

  it("never touches severity, occurrenceCount, or fingerprint — those stay exclusively engine-computed", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemIncident.update.mockResolvedValue(BASE_INCIDENT);
    const { PATCH } = await loadModule();
    await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "MONITORING", notes: "watching it" }) }), params("inc_1"));
    const data = mockPrisma.systemIncident.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("severity");
    expect(data).not.toHaveProperty("occurrenceCount");
    expect(data).not.toHaveProperty("fingerprint");
    expect(data.notes).toBe("watching it");
  });

  it("400s when the body has nothing to update", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { PATCH } = await loadModule();
    const res = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({}) }), params("inc_1"));
    expect(res.status).toBe(400);
  });

  it("404s when updating an incident that doesn't exist", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemIncident.update.mockRejectedValue(new Error("Record to update not found"));
    const { PATCH } = await loadModule();
    const res = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "IGNORED" }) }), params("missing"));
    expect(res.status).toBe(404);
  });
});
