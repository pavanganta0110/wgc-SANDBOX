import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = { systemAlert: { findMany: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemAlert.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/system-health/alerts", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost/api/admin/system-health/alerts"));
    expect(res.status).toBe(401);
  });

  it("joins the parent incident's title/service into each alert row", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemAlert.findMany.mockResolvedValue([
      {
        id: "a1",
        incidentId: "inc_1",
        severity: "CRITICAL",
        channel: "EMAIL",
        notificationType: "INITIAL",
        recipient: "ops@wgc.com",
        deliveryStatus: "SENT",
        providerMessageId: "msg_1",
        failureReason: null,
        sentAt: new Date(),
        incident: { id: "inc_1", title: "Finix Degraded", service: "Finix" },
      },
    ]);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost/api/admin/system-health/alerts"));
    const data = await res.json();
    expect(data.alerts[0]).toMatchObject({ incidentTitle: "Finix Degraded", service: "Finix", deliveryStatus: "SENT" });
  });

  it("applies channel/deliveryStatus/notificationType filters", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { GET } = await loadModule();
    await GET(new Request("http://localhost/api/admin/system-health/alerts?channel=SMS&deliveryStatus=FAILED&notificationType=REMINDER"));
    const whereArg = mockPrisma.systemAlert.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ channel: "SMS", deliveryStatus: "FAILED", notificationType: "REMINDER" });
  });

  it("never exposes anything beyond the platform-admin recipient itself — no donor/merchant PII fields in the response shape", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemAlert.findMany.mockResolvedValue([
      { id: "a1", incidentId: "inc_1", severity: "WARNING", channel: "DASHBOARD", notificationType: "INITIAL", recipient: "platform-admins", deliveryStatus: "SENT", providerMessageId: null, failureReason: null, sentAt: new Date(), incident: { id: "inc_1", title: "x", service: "Aplos" } },
    ]);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost/api/admin/system-health/alerts"));
    const data = await res.json();
    expect(Object.keys(data.alerts[0]).sort()).toEqual(
      ["id", "incidentId", "incidentTitle", "service", "severity", "channel", "notificationType", "recipient", "deliveryStatus", "providerMessageId", "failureReason", "sentAt"].sort()
    );
  });
});
