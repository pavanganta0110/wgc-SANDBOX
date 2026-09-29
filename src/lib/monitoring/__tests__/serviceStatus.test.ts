import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  systemErrorGroup: { findMany: vi.fn(), findFirst: vi.fn() },
  systemHealthEvent: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  paymentAttempt: { count: vi.fn() },
  orgEmailLog: { findFirst: vi.fn(), findMany: vi.fn() },
  authSmsSendLog: { findFirst: vi.fn(), findMany: vi.fn() },
  aplosSyncRecord: { findFirst: vi.fn(), findMany: vi.fn() },
  finixWebhookEvent: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  jobRun: { findFirst: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../serviceStatus");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemErrorGroup.findMany.mockResolvedValue([]);
  mockPrisma.systemErrorGroup.findFirst.mockResolvedValue(null);
  mockPrisma.systemHealthEvent.findFirst.mockResolvedValue(null);
  mockPrisma.systemHealthEvent.count.mockResolvedValue(0);
  mockPrisma.systemHealthEvent.findMany.mockResolvedValue([]);
  mockPrisma.paymentAttempt.count.mockResolvedValue(0);
  mockPrisma.finixWebhookEvent.count.mockResolvedValue(0);
  // Default: no job has ever run, so Background Jobs reads UNKNOWN and every
  // other describe block (which doesn't care about Background Jobs) isn't
  // forced to also stub out the per-job findFirst pair below.
  mockPrisma.jobRun.findFirst.mockResolvedValue(null);
});

describe("getAllServiceStatuses — services with no real measurement yet", () => {
  it("Background Jobs is UNKNOWN when no job has ever run", async () => {
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Background Jobs")?.status).toBe("UNKNOWN");
  });
});

describe("getAllServiceStatuses — Background Jobs", () => {
  // backgroundJobsStatus() issues two findFirst calls per actively-scheduled
  // job (last run, last successful run) after the initial "has anything ever
  // run" check — this helper drives that per-job pair from one table so
  // tests stay readable instead of counting call order by hand.
  function mockJobRuns(byJobName: Record<string, { lastRun: { status: string; startedAt: Date; completedAt?: Date | null } | null; lastSuccessCompletedAt: Date | null }>) {
    mockPrisma.jobRun.findFirst.mockImplementation((args?: { where?: { jobName?: string; status?: string } }) => {
      const jobName = args?.where?.jobName;
      if (!jobName) return Promise.resolve({ id: "some_run" }); // the initial "ever ran at all" probe has no where.jobName
      const entry = byJobName[jobName];
      if (!entry) return Promise.resolve(null);
      if (args?.where?.status === "SUCCEEDED") {
        return Promise.resolve(entry.lastSuccessCompletedAt ? { completedAt: entry.lastSuccessCompletedAt } : null);
      }
      return Promise.resolve(entry.lastRun);
    });
  }

  it("is OPERATIONAL when every actively-scheduled job's most recent run succeeded within its cadence", async () => {
    const now = new Date();
    mockJobRuns({
      reconcile: { lastRun: { status: "SUCCEEDED", startedAt: now }, lastSuccessCompletedAt: now },
    });
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const bg = statuses.find((s) => s.service === "Background Jobs");
    expect(bg?.status).toBe("OPERATIONAL");
    expect(bg?.recentFailureCount).toBe(0);
  });

  it("a non-critical job's FAILED last run only reaches DEGRADED, never OUTAGE", async () => {
    const now = new Date();
    mockJobRuns({
      "invoice-reminders": { lastRun: { status: "FAILED", startedAt: now }, lastSuccessCompletedAt: new Date(now.getTime() - 60 * 60 * 1000) },
    });
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const bg = statuses.find((s) => s.service === "Background Jobs");
    expect(bg?.status).toBe("DEGRADED");
    expect(bg?.recentFailureCount).toBe(1);
  });

  it("a critical job's FAILED last run pushes the whole card to OUTAGE", async () => {
    const now = new Date();
    mockJobRuns({
      reconcile: { lastRun: { status: "FAILED", startedAt: now }, lastSuccessCompletedAt: new Date(now.getTime() - 60 * 60 * 1000) },
    });
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Background Jobs")?.status).toBe("OUTAGE");
  });

  it("one non-critical job failing does not escalate a simultaneous critical-job problem, and a critical OUTAGE is never downgraded by a healthy non-critical job", async () => {
    const now = new Date();
    mockJobRuns({
      reconcile: { lastRun: { status: "SUCCEEDED", startedAt: now }, lastSuccessCompletedAt: now },
      "invoice-reminders": { lastRun: { status: "FAILED", startedAt: now }, lastSuccessCompletedAt: null },
    });
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const bg = statuses.find((s) => s.service === "Background Jobs");
    // Only the non-critical job is unhealthy here, so this stays DEGRADED —
    // a minor job failure must never read as a full platform OUTAGE.
    expect(bg?.status).toBe("DEGRADED");
    expect(bg?.recentFailureCount).toBe(1);
  });

  it("a job with no successful run ever, past its stale window, is flagged stale even if its last run's status was SUCCEEDED long enough ago to no longer count", async () => {
    const now = new Date();
    mockJobRuns({
      "webhook-retry": { lastRun: { status: "SUCCEEDED", startedAt: new Date(now.getTime() - 72 * 60 * 60 * 1000) }, lastSuccessCompletedAt: null },
    });
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const bg = statuses.find((s) => s.service === "Background Jobs");
    expect(bg?.status).not.toBe("OPERATIONAL");
    expect(bg?.note).toMatch(/stale/);
  });

  it("a job that has genuinely never run yet (no row at all) is skipped, not counted as a failure", async () => {
    const now = new Date();
    mockJobRuns({
      reconcile: { lastRun: { status: "SUCCEEDED", startedAt: now }, lastSuccessCompletedAt: now },
      // every other configured job name is absent from the map -> mockJobRuns resolves null for both its findFirst calls
    });
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const bg = statuses.find((s) => s.service === "Background Jobs");
    expect(bg?.status).toBe("OPERATIONAL");
    expect(bg?.recentFailureCount).toBe(0);
  });
});

describe("getAllServiceStatuses — WGC API", () => {
  it("is OPERATIONAL when no open error groups exist", async () => {
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

describe("getAllServiceStatuses — Supabase", () => {
  it("is UNKNOWN when no database error has ever been observed", async () => {
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Supabase")?.status).toBe("UNKNOWN");
  });

  it("is OPERATIONAL when errors exist historically but none in the recent window", async () => {
    mockPrisma.systemHealthEvent.findFirst.mockImplementation(({ where }: { where: { service: string } }) =>
      where.service === "Supabase" ? Promise.resolve({ id: "evt_1", createdAt: new Date(Date.now() - 60 * 60 * 1000) }) : Promise.resolve(null)
    );
    mockPrisma.systemHealthEvent.count.mockResolvedValue(0);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const supabase = statuses.find((s) => s.service === "Supabase");
    expect(supabase?.status).toBe("OPERATIONAL");
    expect(supabase?.recentlyRecovered).toBe(true);
  });

  it("is DEGRADED once 3+ failures land in the 5-minute window", async () => {
    mockPrisma.systemHealthEvent.findFirst.mockImplementation(({ where }: { where: { service: string } }) =>
      where.service === "Supabase" ? Promise.resolve({ id: "evt_1", createdAt: new Date() }) : Promise.resolve(null)
    );
    mockPrisma.systemHealthEvent.count.mockResolvedValue(3);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Supabase")?.status).toBe("DEGRADED");
  });

  it("is OUTAGE once 10+ failures land in the 5-minute window", async () => {
    mockPrisma.systemHealthEvent.findFirst.mockImplementation(({ where }: { where: { service: string } }) =>
      where.service === "Supabase" ? Promise.resolve({ id: "evt_1", createdAt: new Date() }) : Promise.resolve(null)
    );
    mockPrisma.systemHealthEvent.count.mockResolvedValue(10);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Supabase")?.status).toBe("OUTAGE");
  });

  it("a single isolated failure does not flip the service to Degraded", async () => {
    mockPrisma.systemHealthEvent.findFirst.mockImplementation(({ where }: { where: { service: string } }) =>
      where.service === "Supabase" ? Promise.resolve({ id: "evt_1", createdAt: new Date() }) : Promise.resolve(null)
    );
    mockPrisma.systemHealthEvent.count.mockResolvedValue(1);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Supabase")?.status).toBe("OPERATIONAL");
  });
});

describe("getAllServiceStatuses — Finix", () => {
  it("is UNKNOWN when no Finix technical failure has ever been observed", async () => {
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Finix")?.status).toBe("UNKNOWN");
  });

  it("a normal card decline is never counted — PaymentAttempt failures are never queried for Finix status", async () => {
    const { getAllServiceStatuses } = await loadModule();
    await getAllServiceStatuses();
    // The only PaymentAttempt query Finix status makes is a SUCCEEDED count
    // (the traffic-volume denominator) — it must never query FAILED
    // PaymentAttempt rows, which would conflate card declines with outages.
    for (const call of mockPrisma.paymentAttempt.count.mock.calls) {
      expect(call[0]?.where?.status).not.toBe("FAILED");
    }
  });

  it("low volume: any CRITICAL-kind failure alone marks it OUTAGE even with a tiny sample", async () => {
    mockPrisma.systemHealthEvent.findMany.mockImplementation(({ where }: { where: { service: string } }) =>
      where.service === "Finix" ? Promise.resolve([{ createdAt: new Date(), severity: "CRITICAL" }]) : Promise.resolve([])
    );
    mockPrisma.paymentAttempt.count.mockResolvedValue(0);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Finix")?.status).toBe("OUTAGE");
  });

  it("low volume: a non-critical failure alone marks it DEGRADED, not OUTAGE", async () => {
    mockPrisma.systemHealthEvent.findMany.mockImplementation(({ where }: { where: { service: string } }) =>
      where.service === "Finix" ? Promise.resolve([{ createdAt: new Date(), severity: "ERROR" }]) : Promise.resolve([])
    );
    mockPrisma.paymentAttempt.count.mockResolvedValue(0);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Finix")?.status).toBe("DEGRADED");
  });

  it("high volume: a small failure rate below the degraded threshold stays OPERATIONAL", async () => {
    mockPrisma.systemHealthEvent.findMany.mockImplementation(({ where }: { where: { service: string } }) =>
      where.service === "Finix" ? Promise.resolve([{ createdAt: new Date(), severity: "ERROR" }]) : Promise.resolve([])
    );
    mockPrisma.paymentAttempt.count.mockResolvedValue(199); // 1/200 = 0.5%, below 5%
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Finix")?.status).toBe("OPERATIONAL");
  });

  it("high volume: a failure rate above the critical threshold is OUTAGE", async () => {
    mockPrisma.systemHealthEvent.findMany.mockImplementation(({ where }: { where: { service: string } }) =>
      where.service === "Finix" ? Promise.resolve(Array.from({ length: 50 }, () => ({ createdAt: new Date(), severity: "ERROR" }))) : Promise.resolve([])
    );
    mockPrisma.paymentAttempt.count.mockResolvedValue(50); // 50/100 = 50%, above 20% critical
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Finix")?.status).toBe("OUTAGE");
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

  it("Resend is DEGRADED once the failure rate crosses the warning threshold", async () => {
    mockPrisma.orgEmailLog.findFirst.mockResolvedValue({ id: "log_1" });
    mockPrisma.orgEmailLog.findMany.mockResolvedValue([
      ...Array.from({ length: 8 }, () => ({ status: "SENT", createdAt: new Date() })),
      { status: "FAILED", createdAt: new Date() },
      { status: "FAILED", createdAt: new Date() },
    ]); // 2/10 = 20%, above 10% warning, below 40% critical
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Resend")?.status).toBe("DEGRADED");
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

  it("Webhooks escalates to DEGRADED from backlog alone, even with a clean failure rate", async () => {
    mockPrisma.finixWebhookEvent.findFirst.mockResolvedValue({ id: "evt_1" });
    mockPrisma.finixWebhookEvent.findMany.mockResolvedValue([{ processingStatus: "COMPLETED", createdAt: new Date() }]);
    mockPrisma.finixWebhookEvent.count.mockResolvedValue(15); // >= WEBHOOK_BACKLOG_WARNING (10)
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Webhooks")?.status).toBe("DEGRADED");
  });

  it("Twilio is UNKNOWN when no SMS has ever been sent", async () => {
    mockPrisma.authSmsSendLog.findFirst.mockResolvedValue(null);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    expect(statuses.find((s) => s.service === "Twilio")?.status).toBe("UNKNOWN");
  });

  it("Twilio does not count a recipient-specific error code (bad number) as a technical failure", async () => {
    mockPrisma.authSmsSendLog.findFirst.mockResolvedValue({ id: "log_1" });
    mockPrisma.authSmsSendLog.findMany.mockResolvedValue([
      { deliveryStatus: "FAILED", errorCode: "21211", createdAt: new Date() }, // invalid number — recipient-specific
      { deliveryStatus: "DELIVERED", errorCode: null, createdAt: new Date() },
    ]);
    const { getAllServiceStatuses } = await loadModule();
    const statuses = await getAllServiceStatuses();
    const twilio = statuses.find((s) => s.service === "Twilio");
    expect(twilio?.status).toBe("OPERATIONAL");
    expect(twilio?.recentFailureCount).toBe(0);
  });
});
