import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  systemErrorGroup: { findMany: vi.fn() },
  systemHealthEvent: { findFirst: vi.fn() },
  orgEmailLog: { findFirst: vi.fn(), findMany: vi.fn() },
  authSmsSendLog: { findFirst: vi.fn(), findMany: vi.fn() },
  aplosSyncRecord: { findFirst: vi.fn(), findMany: vi.fn() },
  finixWebhookEvent: { findFirst: vi.fn(), findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../serviceStatus");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemErrorGroup.findMany.mockResolvedValue([]);
});

describe("getAllServiceStatuses — services with no real measurement yet", () => {
  it("Supabase is always UNKNOWN — no database health monitoring exists yet", async () => {
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const supabase = statuses.find((s) => s.service === "Supabase");
    expect(supabase?.status).toBe("UNKNOWN");
  });

  it("Finix is always UNKNOWN — a card decline must never be mistaken for a technical failure", async () => {
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const finix = statuses.find((s) => s.service === "Finix");
    expect(finix?.status).toBe("UNKNOWN");
  });

  it("Background Jobs is always UNKNOWN — no job-run history table exists yet", async () => {
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const jobs = statuses.find((s) => s.service === "Background Jobs");
    expect(jobs?.status).toBe("UNKNOWN");
  });
});

describe("getAllServiceStatuses — services reusing existing real data", () => {
  it("Resend is UNKNOWN when no email has ever been logged", async () => {
    mockPrisma.orgEmailLog.findFirst.mockResolvedValue(null);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Resend")?.status).toBe("UNKNOWN");
  });

  it("Resend is OPERATIONAL when emails exist and none failed in the window", async () => {
    mockPrisma.orgEmailLog.findFirst.mockResolvedValue({ id: "log_1" });
    mockPrisma.orgEmailLog.findMany.mockResolvedValue([{ status: "SENT", createdAt: new Date() }]);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Resend")?.status).toBe("OPERATIONAL");
  });

  it("Resend is DEGRADED when some, but not most, recent emails failed", async () => {
    mockPrisma.orgEmailLog.findFirst.mockResolvedValue({ id: "log_1" });
    mockPrisma.orgEmailLog.findMany.mockResolvedValue([
      { status: "SENT", createdAt: new Date() },
      { status: "SENT", createdAt: new Date() },
      { status: "SENT", createdAt: new Date() },
      { status: "FAILED", createdAt: new Date() },
    ]);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const resend = statuses.find((s) => s.service === "Resend");
    expect(resend?.status).toBe("DEGRADED");
    expect(resend?.recentFailureCount).toBe(1);
  });

  it("Aplos is UNKNOWN when no church has ever synced", async () => {
    mockPrisma.aplosSyncRecord.findFirst.mockResolvedValue(null);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Aplos")?.status).toBe("UNKNOWN");
  });

  it("Webhooks is UNKNOWN when no Finix webhook has ever been received", async () => {
    mockPrisma.finixWebhookEvent.findFirst.mockResolvedValue(null);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Webhooks")?.status).toBe("UNKNOWN");
  });

  it("Twilio is UNKNOWN when no SMS has ever been sent", async () => {
    mockPrisma.authSmsSendLog.findFirst.mockResolvedValue(null);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Twilio")?.status).toBe("UNKNOWN");
  });
});

describe("getAllServiceStatuses — WGC API", () => {
  it("is OPERATIONAL when no open error groups exist", async () => {
    mockPrisma.systemErrorGroup.findMany.mockResolvedValue([]);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "WGC API")?.status).toBe("OPERATIONAL");
  });

  it("is OUTAGE when an open CRITICAL error group exists", async () => {
    mockPrisma.systemErrorGroup.findMany.mockResolvedValue([{ lastSeenAt: new Date(), severity: "CRITICAL", occurrenceCount: 5 }]);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "WGC API")?.status).toBe("OUTAGE");
  });

  it("is DEGRADED when an open ERROR (non-critical) group exists", async () => {
    mockPrisma.systemErrorGroup.findMany.mockResolvedValue([{ lastSeenAt: new Date(), severity: "ERROR", occurrenceCount: 2 }]);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "WGC API")?.status).toBe("DEGRADED");
  });
});
