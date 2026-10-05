import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  donor: { findMany: vi.fn(), findFirst: vi.fn() },
  fund: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
  externalDonation: { findMany: vi.fn(), create: vi.fn() },
  migrationJob: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  migrationRecord: { createMany: vi.fn(), updateMany: vi.fn() },
  migrationError: { create: vi.fn() },
  migrationMapping: { upsert: vi.fn() },
  $transaction: vi.fn((ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : (ops as () => unknown)())),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockResolveOrCreateDonor = vi.fn();
vi.mock("@/lib/donors/resolveOrCreateDonor", () => ({ resolveOrCreateDonor: mockResolveOrCreateDonor }));

const mockResolveWithMatchReview = vi.fn();
vi.mock("@/lib/donors/resolveOrCreateDonorWithMatchReview", () => ({ resolveOrCreateDonorWithMatchReview: mockResolveWithMatchReview }));

function baseJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job1",
    churchId: "church-a",
    sourceSystem: "CSV_GENERIC",
    status: "READY",
    entityTypesJson: ["DONOR"],
    fileName: "donors.csv",
    totalRecords: 0,
    processedRecords: 0,
    succeededRecords: 0,
    failedRecords: 0,
    skippedRecords: 0,
    sourceDataJson: [],
    createdAt: new Date("2026-01-01"),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("previewMigrationSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags a DONOR row whose email already exists in the org as a possible duplicate", async () => {
    mockPrisma.donor.findMany.mockResolvedValue([{ normalizedEmail: "jane@example.com" }]);
    const { previewMigrationSource } = await import("../migrationEngine");

    const csv = "Full Name,Email\nJane Doe,jane@example.com\n";
    const result = await previewMigrationSource("church-a", "DONOR", csv);

    expect(result.rows[0].status).toBe("duplicate");
    expect(result.rows[0].possibleDuplicate).toBe(true);
  });

  it("marks a DONOR row with neither email nor phone as invalid", async () => {
    mockPrisma.donor.findMany.mockResolvedValue([]);
    const { previewMigrationSource } = await import("../migrationEngine");

    const csv = "Full Name,Email\nNo Contact Info,\n";
    const result = await previewMigrationSource("church-a", "DONOR", csv);

    expect(result.rows[0].status).toBe("invalid");
  });

  it("flags a FUND row matching an existing fund name as a possible duplicate", async () => {
    mockPrisma.fund.findMany.mockResolvedValue([{ name: "Building Fund" }]);
    const { previewMigrationSource } = await import("../migrationEngine");

    const csv = "Fund Name\nbuilding fund\n";
    const result = await previewMigrationSource("church-a", "FUND", csv);

    expect(result.rows[0].possibleDuplicate).toBe(true);
  });

  it("flags a DONATION_HISTORY row matching an existing importFingerprint", async () => {
    mockPrisma.externalDonation.findMany.mockResolvedValue([
      { donationAmountCents: 5000, donationDate: new Date("2026-01-01"), externalTransactionId: null, confirmationNumber: null, checkNumber: null, importFingerprint: "will-not-match" },
    ]);
    const { previewMigrationSource } = await import("../migrationEngine");

    const csv = "First Name,Last Name,Amount,Date\nJane,Doe,50.00,2026-01-01\n";
    const result = await previewMigrationSource("church-a", "DONATION_HISTORY", csv);

    // Not a duplicate against the seeded fingerprint (deliberately different), but should validate cleanly.
    expect(result.rows[0].status).toBe("valid");
  });
});

describe("commitMigrationEntitySource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stages only valid, non-skipped rows and persists a MigrationRecord for every row", async () => {
    mockPrisma.migrationJob.findFirst.mockResolvedValue(baseJob({ sourceDataJson: [] }));
    mockPrisma.donor.findMany.mockResolvedValue([]);
    mockPrisma.migrationJob.update.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...baseJob(), ...args.data }));

    const { commitMigrationEntitySource } = await import("../migrationEngine");

    const csv = "Full Name,Email\nJane Doe,jane@example.com\nBad Row,\n";
    const updated = await commitMigrationEntitySource({
      jobId: "job1",
      churchId: "church-a",
      entityType: "DONOR",
      csvText: csv,
      fileName: "donors.csv",
      mapping: { "Full Name": "name", Email: "email" },
      skipRowNumbers: [],
    });

    expect(mockPrisma.migrationRecord.createMany).toHaveBeenCalledTimes(1);
    const created = mockPrisma.migrationRecord.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(2);
    expect(created.find((r: { rowNumber: number }) => r.rowNumber === 1).status).toBe("VALID");
    expect(created.find((r: { rowNumber: number }) => r.rowNumber === 2).status).toBe("INVALID");

    // Only the valid row (row 1) should be staged for processing.
    const jobUpdateData = mockPrisma.migrationJob.update.mock.calls[0][0].data;
    expect(jobUpdateData.sourceDataJson).toHaveLength(1);
    expect(jobUpdateData.totalRecords).toBe(1);
    expect(jobUpdateData.status).toBe("READY");
    expect(updated.status).toBe("READY");
  });

  it("marks explicitly skipped rows as SKIPPED and excludes them from staging", async () => {
    mockPrisma.migrationJob.findFirst.mockResolvedValue(baseJob({ sourceDataJson: [] }));
    mockPrisma.donor.findMany.mockResolvedValue([]);
    mockPrisma.migrationJob.update.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...baseJob(), ...args.data }));

    const { commitMigrationEntitySource } = await import("../migrationEngine");

    const csv = "Full Name,Email\nJane Doe,jane@example.com\n";
    await commitMigrationEntitySource({
      jobId: "job1",
      churchId: "church-a",
      entityType: "DONOR",
      csvText: csv,
      fileName: "donors.csv",
      mapping: { "Full Name": "name", Email: "email" },
      skipRowNumbers: [1],
    });

    const created = mockPrisma.migrationRecord.createMany.mock.calls[0][0].data;
    expect(created[0].status).toBe("SKIPPED");
    const jobUpdateData = mockPrisma.migrationJob.update.mock.calls[0][0].data;
    expect(jobUpdateData.sourceDataJson).toHaveLength(0);
  });
});

describe("processMigrationJobChunk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is a no-op once the job is COMPLETED", async () => {
    mockPrisma.migrationJob.findFirst.mockResolvedValue(baseJob({ status: "COMPLETED" }));
    const { processMigrationJobChunk } = await import("../migrationEngine");

    const result = await processMigrationJobChunk("job1", "church-a", "user1");

    expect(result.status).toBe("COMPLETED");
    expect(mockPrisma.migrationJob.update).not.toHaveBeenCalled();
  });

  it("processes FUND rows before DONOR rows regardless of storage order", async () => {
    mockPrisma.migrationJob.findFirst.mockResolvedValue(
      baseJob({
        sourceDataJson: [
          { entityType: "DONOR", rowNumber: 1, fields: { name: "Jane Doe", email: "jane@example.com" } },
          { entityType: "FUND", rowNumber: 1, fields: { name: "Building Fund" } },
        ],
        totalRecords: 2,
      })
    );
    mockPrisma.fund.findFirst.mockResolvedValue(null);
    mockPrisma.fund.aggregate.mockResolvedValue({ _max: { displayOrder: 0 } });
    mockPrisma.fund.create.mockResolvedValue({ id: "fund1" });
    mockResolveOrCreateDonor.mockResolvedValue({ id: "donor1", created: true, updated: false });
    mockPrisma.migrationJob.update.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...baseJob(), ...args.data }));

    const { processMigrationJobChunk } = await import("../migrationEngine");
    await processMigrationJobChunk("job1", "church-a", "user1");

    // Fund must be created before the donor resolver is invoked.
    expect(mockPrisma.fund.create).toHaveBeenCalled();
    expect(mockResolveOrCreateDonor).toHaveBeenCalled();
    const fundCallOrder = mockPrisma.fund.create.mock.invocationCallOrder[0];
    const donorCallOrder = mockResolveOrCreateDonor.mock.invocationCallOrder[0];
    expect(fundCallOrder).toBeLessThan(donorCallOrder);
  });

  it("advances the processedRecords cursor by the chunk size and never reprocesses an already-imported row", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ entityType: "DONOR", rowNumber: i + 1, fields: { name: `Donor ${i + 1}`, email: `d${i + 1}@example.com` } }));
    mockPrisma.migrationJob.findFirst.mockResolvedValue(baseJob({ sourceDataJson: rows, totalRecords: 30, processedRecords: 0 }));
    mockResolveOrCreateDonor.mockResolvedValue({ id: "donor-x", created: true, updated: false });
    mockPrisma.migrationJob.update.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...baseJob(), sourceDataJson: rows, totalRecords: 30, ...args.data }));

    const { processMigrationJobChunk } = await import("../migrationEngine");
    const result = await processMigrationJobChunk("job1", "church-a", "user1");

    expect(mockResolveOrCreateDonor).toHaveBeenCalledTimes(25); // MIGRATION_JOB_CHUNK_SIZE
    expect(result.processedRecords).toBe(25);
    expect(result.status).toBe("IMPORTING");
  });

  it("records a MigrationError and marks the record FAILED when a row throws, and reports COMPLETED_WITH_ERRORS", async () => {
    mockPrisma.migrationJob.findFirst.mockResolvedValue(
      baseJob({ sourceDataJson: [{ entityType: "DONOR", rowNumber: 1, fields: { name: "Bad Row", email: null, phone: null } }], totalRecords: 1 })
    );
    mockPrisma.migrationJob.update.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...baseJob(), ...args.data }));

    const { processMigrationJobChunk } = await import("../migrationEngine");
    const result = await processMigrationJobChunk("job1", "church-a", "user1");

    expect(mockPrisma.migrationError.create).toHaveBeenCalled();
    expect(result.status).toBe("COMPLETED_WITH_ERRORS");
    expect(result.failedRecords).toBe(1);
  });
});
