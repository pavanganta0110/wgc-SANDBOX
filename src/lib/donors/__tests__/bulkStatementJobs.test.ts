import { describe, it, expect, vi, beforeEach } from "vitest";

function makeJobStore() {
  const jobs = new Map<string, any>();
  let nextId = 1;
  return {
    jobs,
    bulkStatementJob: {
      create: vi.fn(async ({ data }: any) => {
        const job = {
          id: `job-${nextId++}`,
          processedCount: 0,
          succeededCount: 0,
          failedCount: 0,
          needsReviewCount: 0,
          skippedCount: 0,
          ...data,
        };
        jobs.set(job.id, job);
        return job;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        const job = jobs.get(where.id);
        if (!job || job.churchId !== where.churchId) return null;
        return job;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const job = jobs.get(where.id);
        const updated = { ...job, ...data };
        jobs.set(where.id, updated);
        return updated;
      }),
    },
    annualDonationStatement: {
      findFirst: vi.fn(async () => ({ id: "stmt-1", statementStatus: "READY" })),
    },
  };
}

describe("createBulkStatementJob", () => {
  beforeEach(() => vi.resetModules());

  it("creates a PENDING job with the given target IDs", async () => {
    const prismaMock = makeJobStore();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/generateStatement", () => ({ generateYearEndStatement: vi.fn(), sendYearEndStatementEmail: vi.fn() }));
    const { createBulkStatementJob } = await import("@/lib/donors/bulkStatementJobs");

    const job = await createBulkStatementJob("church-A", 2026, "GENERATE", ["D1", "D2", "D3"], "user-1");
    expect(job.status).toBe("PENDING");
    expect(job.totalCount).toBe(3);
    expect(job.processedCount).toBe(0);
  });

  it("marks an empty target list as immediately COMPLETED", async () => {
    const prismaMock = makeJobStore();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/generateStatement", () => ({ generateYearEndStatement: vi.fn(), sendYearEndStatementEmail: vi.fn() }));
    const { createBulkStatementJob } = await import("@/lib/donors/bulkStatementJobs");

    const job = await createBulkStatementJob("church-A", 2026, "GENERATE", [], "user-1");
    expect(job.status).toBe("COMPLETED");
  });
});

describe("processBulkStatementJobChunk", () => {
  beforeEach(() => vi.resetModules());

  it("processes only one chunk per call and advances the cursor without reprocessing prior IDs", async () => {
    const prismaMock = makeJobStore();
    const generateYearEndStatement = vi.fn(async () => ({ statementId: "s", version: 1, status: "READY", missingFields: [] }));
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/generateStatement", () => ({ generateYearEndStatement, sendYearEndStatementEmail: vi.fn() }));
    const { createBulkStatementJob, processBulkStatementJobChunk, BULK_JOB_CHUNK_SIZE } = await import("@/lib/donors/bulkStatementJobs");

    const targetIds = Array.from({ length: BULK_JOB_CHUNK_SIZE + 2 }, (_, i) => `D${i}`);
    const job = await createBulkStatementJob("church-A", 2026, "GENERATE", targetIds, "user-1");

    const afterFirstChunk = await processBulkStatementJobChunk(job.id, "church-A", "actor@example.com");
    expect(afterFirstChunk.processedCount).toBe(BULK_JOB_CHUNK_SIZE);
    expect(afterFirstChunk.status).toBe("RUNNING");
    expect(generateYearEndStatement).toHaveBeenCalledTimes(BULK_JOB_CHUNK_SIZE);

    const afterSecondChunk = await processBulkStatementJobChunk(job.id, "church-A", "actor@example.com");
    expect(afterSecondChunk.processedCount).toBe(targetIds.length);
    expect(afterSecondChunk.status).toBe("COMPLETED");
    expect(generateYearEndStatement).toHaveBeenCalledTimes(targetIds.length);
  });

  it("is a no-op when called again after COMPLETED", async () => {
    const prismaMock = makeJobStore();
    const generateYearEndStatement = vi.fn(async () => ({ statementId: "s", version: 1, status: "READY", missingFields: [] }));
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/generateStatement", () => ({ generateYearEndStatement, sendYearEndStatementEmail: vi.fn() }));
    const { createBulkStatementJob, processBulkStatementJobChunk } = await import("@/lib/donors/bulkStatementJobs");

    const job = await createBulkStatementJob("church-A", 2026, "GENERATE", ["D1"], "user-1");
    const afterFirstCall = await processBulkStatementJobChunk(job.id, "church-A", null);
    expect(afterFirstCall.status).toBe("COMPLETED");
    const afterCompletion = await processBulkStatementJobChunk(job.id, "church-A", null);
    expect(afterCompletion.status).toBe("COMPLETED");
    expect(generateYearEndStatement).toHaveBeenCalledTimes(1);
  });

  it("counts a failed generation without stopping the rest of the chunk", async () => {
    const prismaMock = makeJobStore();
    const generateYearEndStatement = vi
      .fn()
      .mockResolvedValueOnce({ statementId: "s1", version: 1, status: "READY", missingFields: [] })
      .mockRejectedValueOnce(new Error("boom"));
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/generateStatement", () => ({ generateYearEndStatement, sendYearEndStatementEmail: vi.fn() }));
    const { createBulkStatementJob, processBulkStatementJobChunk } = await import("@/lib/donors/bulkStatementJobs");

    const job = await createBulkStatementJob("church-A", 2026, "GENERATE", ["D1", "D2"], "user-1");
    const result = await processBulkStatementJobChunk(job.id, "church-A", null);
    expect(result.succeededCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.status).toBe("COMPLETED");
  });

  it("skips a SEND target still stuck in NEEDS_REVIEW instead of emailing it", async () => {
    const prismaMock = makeJobStore();
    prismaMock.annualDonationStatement.findFirst = vi.fn(async () => ({ id: "stmt-1", statementStatus: "NEEDS_REVIEW" }));
    const sendYearEndStatementEmail = vi.fn();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/generateStatement", () => ({ generateYearEndStatement: vi.fn(), sendYearEndStatementEmail }));
    const { createBulkStatementJob, processBulkStatementJobChunk } = await import("@/lib/donors/bulkStatementJobs");

    const job = await createBulkStatementJob("church-A", 2026, "SEND", ["stmt-1"], "user-1");
    const result = await processBulkStatementJobChunk(job.id, "church-A", "actor@example.com");
    expect(sendYearEndStatementEmail).not.toHaveBeenCalled();
    expect(result.skippedCount).toBe(1);
  });
});
