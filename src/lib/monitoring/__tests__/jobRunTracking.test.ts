import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  jobRun: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockRecordHealthEvent = vi.fn();
vi.mock("../healthEvents", () => ({ recordHealthEvent: mockRecordHealthEvent }));

const mockGetJobConfig = vi.fn();
vi.mock("../jobCadence", () => ({ getJobConfig: mockGetJobConfig }));

async function loadModule() {
  vi.resetModules();
  return import("../jobRunTracking");
}

const RUN_ROW = { jobName: "reconcile", merchantId: null, requestId: "req_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.jobRun.create.mockResolvedValue({ id: "run_1" });
  mockPrisma.jobRun.update.mockResolvedValue({});
  mockPrisma.jobRun.findUnique.mockResolvedValue({ startedAt: new Date(Date.now() - 1000), ...RUN_ROW });
  mockGetJobConfig.mockReturnValue({ critical: false });
});

describe("startJobRun", () => {
  it("creates a RUNNING JobRun row and returns its id", async () => {
    const { startJobRun } = await loadModule();
    const runId = await startJobRun({ jobName: "reconcile", jobType: "settlement" });
    expect(runId).toBe("run_1");
    expect(mockPrisma.jobRun.create.mock.calls[0][0].data).toMatchObject({ jobName: "reconcile", jobType: "settlement", status: "RUNNING", attempt: 1 });
  });

  it("returns null and never throws when the write itself fails", async () => {
    mockPrisma.jobRun.create.mockRejectedValue(new Error("db blip"));
    const { startJobRun } = await loadModule();
    await expect(startJobRun({ jobName: "reconcile", jobType: "settlement" })).resolves.toBeNull();
  });
});

describe("completeJobRun", () => {
  it("marks the run SUCCEEDED and never records a health event", async () => {
    const { completeJobRun } = await loadModule();
    await completeJobRun({ runId: "run_1", processedCount: 5, successCount: 5, failedCount: 0 });
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run_1" }, data: expect.objectContaining({ status: "SUCCEEDED" }) }));
    expect(mockRecordHealthEvent).not.toHaveBeenCalled();
  });

  it("no-ops when runId is null (startJobRun's write failed)", async () => {
    const { completeJobRun } = await loadModule();
    await completeJobRun({ runId: null, processedCount: 1, successCount: 1, failedCount: 0 });
    expect(mockPrisma.jobRun.update).not.toHaveBeenCalled();
  });
});

describe("failJobRun", () => {
  it("marks the run FAILED and records an ERROR health event for a non-critical job", async () => {
    mockGetJobConfig.mockReturnValue({ critical: false });
    const { failJobRun } = await loadModule();
    await failJobRun({ runId: "run_1", errorMessage: "boom" });
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastErrorMessage: "boom" }) }));
    expect(mockRecordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ service: "Background Jobs", severity: "ERROR" }));
  });

  it("escalates to CRITICAL for a critical job", async () => {
    mockGetJobConfig.mockReturnValue({ critical: true });
    const { failJobRun } = await loadModule();
    await failJobRun({ runId: "run_1", errorMessage: "boom" });
    expect(mockRecordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: "CRITICAL" }));
  });

  it("never throws even when the update itself fails", async () => {
    mockPrisma.jobRun.update.mockRejectedValue(new Error("db down"));
    const { failJobRun } = await loadModule();
    await expect(failJobRun({ runId: "run_1", errorMessage: "boom" })).resolves.toBeUndefined();
  });

  it("no-ops when runId is null", async () => {
    const { failJobRun } = await loadModule();
    await failJobRun({ runId: null, errorMessage: "boom" });
    expect(mockPrisma.jobRun.update).not.toHaveBeenCalled();
    expect(mockRecordHealthEvent).not.toHaveBeenCalled();
  });
});

describe("markJobPartialFailure", () => {
  it("records WARNING when the failure share is below 50%", async () => {
    mockGetJobConfig.mockReturnValue({ critical: true }); // even a critical job stays WARNING for a small failure share
    const { markJobPartialFailure } = await loadModule();
    await markJobPartialFailure({ runId: "run_1", processedCount: 10, successCount: 9, failedCount: 1 });
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_FAILED" }) }));
    expect(mockRecordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: "WARNING" }));
  });

  it("escalates to ERROR (non-critical) once the failure share reaches 50%", async () => {
    mockGetJobConfig.mockReturnValue({ critical: false });
    const { markJobPartialFailure } = await loadModule();
    await markJobPartialFailure({ runId: "run_1", processedCount: 10, successCount: 5, failedCount: 5 });
    expect(mockRecordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: "ERROR" }));
  });

  it("escalates to CRITICAL once the failure share reaches 50% on a critical job", async () => {
    mockGetJobConfig.mockReturnValue({ critical: true });
    const { markJobPartialFailure } = await loadModule();
    await markJobPartialFailure({ runId: "run_1", processedCount: 10, successCount: 5, failedCount: 5 });
    expect(mockRecordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ severity: "CRITICAL" }));
  });
});

describe("withJobRunTracking", () => {
  it("SUCCEEDED path: no failures at all", async () => {
    const { withJobRunTracking } = await loadModule();
    const result = await withJobRunTracking({ jobName: "reconcile", jobType: "settlement" }, async () => ({ processedCount: 3, successCount: 3, failedCount: 0 }));
    expect(result).toEqual({ processedCount: 3, successCount: 3, failedCount: 0 });
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }));
  });

  it("PARTIALLY_FAILED path: some succeeded, some failed", async () => {
    const { withJobRunTracking } = await loadModule();
    await withJobRunTracking({ jobName: "reconcile", jobType: "settlement" }, async () => ({ processedCount: 4, successCount: 2, failedCount: 2 }));
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PARTIALLY_FAILED" }) }));
  });

  it("FAILED path: everything processed failed", async () => {
    const { withJobRunTracking } = await loadModule();
    await withJobRunTracking({ jobName: "reconcile", jobType: "settlement" }, async () => ({ processedCount: 3, successCount: 0, failedCount: 3 }));
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("FAILED path: the work function throws — marks FAILED and re-throws to the caller", async () => {
    const { withJobRunTracking } = await loadModule();
    await expect(
      withJobRunTracking({ jobName: "reconcile", jobType: "settlement" }, async () => {
        throw new Error("kaboom");
      })
    ).rejects.toThrow("kaboom");
    expect(mockPrisma.jobRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastErrorMessage: "kaboom" }) }));
  });

  it("still returns the work function's result even when the tracking write itself fails", async () => {
    mockPrisma.jobRun.create.mockRejectedValue(new Error("db blip"));
    const { withJobRunTracking } = await loadModule();
    const result = await withJobRunTracking({ jobName: "reconcile", jobType: "settlement" }, async () => ({ processedCount: 1, successCount: 1, failedCount: 0 }));
    expect(result).toEqual({ processedCount: 1, successCount: 1, failedCount: 0 });
    // runId was null, so completeJobRun's no-runId guard should have skipped the update entirely
    expect(mockPrisma.jobRun.update).not.toHaveBeenCalled();
  });
});
