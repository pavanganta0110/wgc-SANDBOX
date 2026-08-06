import { describe, it, expect, vi, beforeEach } from "vitest";

function makeJobStore(queuedDonations: { id: string; receiptStatus: string }[] = []) {
  const jobs = new Map<string, any>();
  let nextId = 1;
  const donations = new Map(queuedDonations.map((d) => [d.id, d]));
  return {
    jobs,
    donations,
    bulkReceiptJob: {
      create: vi.fn(async ({ data }: any) => {
        const job = {
          id: `job-${nextId++}`,
          processedCount: 0,
          succeededCount: 0,
          failedCount: 0,
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
    externalDonation: {
      findMany: vi.fn(async () => queuedDonations.map((d) => ({ id: d.id }))),
      findFirst: vi.fn(async ({ where }: any) => {
        const donation = donations.get(where.id);
        if (!donation) return null;
        return { receiptStatus: donation.receiptStatus };
      }),
    },
  };
}

describe("createBulkReceiptJob", () => {
  beforeEach(() => vi.resetModules());

  it("creates a PENDING job targeting every QUEUED donation for the church", async () => {
    const prismaMock = makeJobStore([
      { id: "d1", receiptStatus: "QUEUED" },
      { id: "d2", receiptStatus: "QUEUED" },
    ]);
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({ sendExternalDonationReceiptEmail: vi.fn() }));
    const { createBulkReceiptJob } = await import("@/lib/donations/bulkReceiptJobs");

    const job = await createBulkReceiptJob("church-A", "user-1");
    expect(job.status).toBe("PENDING");
    expect(job.totalCount).toBe(2);
    expect(prismaMock.externalDonation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-A", receiptStatus: "QUEUED" }) })
    );
  });

  it("marks a job with no queued donations as immediately COMPLETED", async () => {
    const prismaMock = makeJobStore([]);
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({ sendExternalDonationReceiptEmail: vi.fn() }));
    const { createBulkReceiptJob } = await import("@/lib/donations/bulkReceiptJobs");

    const job = await createBulkReceiptJob("church-A", "user-1");
    expect(job.status).toBe("COMPLETED");
    expect(job.totalCount).toBe(0);
  });
});

describe("processBulkReceiptJobChunk", () => {
  beforeEach(() => vi.resetModules());

  it("processes only one chunk per call and advances the cursor without reprocessing prior IDs", async () => {
    const queued = Array.from({ length: 7 }, (_, i) => ({ id: `d${i}`, receiptStatus: "QUEUED" }));
    const prismaMock = makeJobStore(queued);
    const sendExternalDonationReceiptEmail = vi.fn(async () => ({ success: true }));
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({ sendExternalDonationReceiptEmail }));
    const { createBulkReceiptJob, processBulkReceiptJobChunk, BULK_RECEIPT_JOB_CHUNK_SIZE } = await import("@/lib/donations/bulkReceiptJobs");

    const job = await createBulkReceiptJob("church-A", "user-1");
    const afterFirstChunk = await processBulkReceiptJobChunk(job.id, "church-A", "user-1");
    expect(afterFirstChunk.processedCount).toBe(BULK_RECEIPT_JOB_CHUNK_SIZE);
    expect(afterFirstChunk.status).toBe("RUNNING");
    expect(sendExternalDonationReceiptEmail).toHaveBeenCalledTimes(BULK_RECEIPT_JOB_CHUNK_SIZE);

    const afterSecondChunk = await processBulkReceiptJobChunk(job.id, "church-A", "user-1");
    expect(afterSecondChunk.processedCount).toBe(7);
    expect(afterSecondChunk.status).toBe("COMPLETED");
    expect(sendExternalDonationReceiptEmail).toHaveBeenCalledTimes(7);
  });

  it("is a no-op when called again after COMPLETED", async () => {
    const prismaMock = makeJobStore([{ id: "d1", receiptStatus: "QUEUED" }]);
    const sendExternalDonationReceiptEmail = vi.fn(async () => ({ success: true }));
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({ sendExternalDonationReceiptEmail }));
    const { createBulkReceiptJob, processBulkReceiptJobChunk } = await import("@/lib/donations/bulkReceiptJobs");

    const job = await createBulkReceiptJob("church-A", "user-1");
    const afterFirstCall = await processBulkReceiptJobChunk(job.id, "church-A", "user-1");
    expect(afterFirstCall.status).toBe("COMPLETED");
    const afterSecondCall = await processBulkReceiptJobChunk(job.id, "church-A", "user-1");
    expect(afterSecondCall.status).toBe("COMPLETED");
    expect(sendExternalDonationReceiptEmail).toHaveBeenCalledTimes(1);
  });

  it("counts a thrown exception as failed without stopping the rest of the chunk", async () => {
    const prismaMock = makeJobStore([
      { id: "d1", receiptStatus: "QUEUED" },
      { id: "d2", receiptStatus: "QUEUED" },
    ]);
    const sendExternalDonationReceiptEmail = vi.fn().mockResolvedValueOnce({ success: true }).mockRejectedValueOnce(new Error("boom"));
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({ sendExternalDonationReceiptEmail }));
    const { createBulkReceiptJob, processBulkReceiptJobChunk } = await import("@/lib/donations/bulkReceiptJobs");

    const job = await createBulkReceiptJob("church-A", "user-1");
    const result = await processBulkReceiptJobChunk(job.id, "church-A", "user-1");
    expect(result.succeededCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it("counts an email-provider-level failure (result.success === false, no throw) as failed, not succeeded", async () => {
    const prismaMock = makeJobStore([{ id: "d1", receiptStatus: "QUEUED" }]);
    const sendExternalDonationReceiptEmail = vi.fn(async () => ({ success: false }));
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({ sendExternalDonationReceiptEmail }));
    const { createBulkReceiptJob, processBulkReceiptJobChunk } = await import("@/lib/donations/bulkReceiptJobs");

    const job = await createBulkReceiptJob("church-A", "user-1");
    const result = await processBulkReceiptJobChunk(job.id, "church-A", "user-1");
    expect(result.succeededCount).toBe(0);
    expect(result.failedCount).toBe(1);
  });

  it("skips (does not send or fail) a donation whose receiptStatus has since moved off QUEUED", async () => {
    const prismaMock = makeJobStore([{ id: "d1", receiptStatus: "QUEUED" }]);
    const sendExternalDonationReceiptEmail = vi.fn(async () => ({ success: true }));
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({ sendExternalDonationReceiptEmail }));
    const { createBulkReceiptJob, processBulkReceiptJobChunk } = await import("@/lib/donations/bulkReceiptJobs");

    const job = await createBulkReceiptJob("church-A", "user-1");
    // Simulate someone sending this donation's receipt individually while the job was pending.
    prismaMock.donations.set("d1", { id: "d1", receiptStatus: "SENT" });

    const result = await processBulkReceiptJobChunk(job.id, "church-A", "user-1");
    expect(sendExternalDonationReceiptEmail).not.toHaveBeenCalled();
    expect(result.skippedCount).toBe(1);
  });
});
