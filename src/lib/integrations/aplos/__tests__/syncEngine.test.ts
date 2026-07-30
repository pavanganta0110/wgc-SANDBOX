import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aplosConnection: { findUnique: vi.fn(), updateMany: vi.fn() },
    aplosSyncRecord: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    aplosSyncAttempt: { create: vi.fn() },
    church: { findUnique: vi.fn().mockResolvedValue({ name: "Test Church" }) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    emailLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: vi.fn().mockResolvedValue({ success: true }) }));

vi.mock("../contributionBuilder", () => ({ buildSettlementContributions: vi.fn() }));

vi.mock("../contributionsClient", () => ({
  postAplosContribution: vi.fn(),
  AplosContributionPostError: class AplosContributionPostError extends Error {
    normalized: { category: string; retryable: boolean; safeMessage: string };
    ambiguous: boolean;
    constructor(normalized: { category: string; retryable: boolean; safeMessage: string }, ambiguous: boolean) {
      super(normalized.safeMessage);
      this.name = "AplosContributionPostError";
      this.normalized = normalized;
      this.ambiguous = ambiguous;
    }
  },
}));

vi.mock("../resourceService", () => ({
  getReadyConnectionToken: vi.fn(),
  AplosConnectionNotReadyError: class AplosConnectionNotReadyError extends Error {
    constructor() {
      super("This organization's Aplos connection is not active.");
      this.name = "AplosConnectionNotReadyError";
    }
  },
}));

const CONNECTION = { syncVersion: 1 };

const BASE_RECORD = {
  id: "sync-1",
  churchId: "church-1",
  settlementId: "stl_1",
  syncVersion: 1,
  status: "PENDING",
  attemptCount: 0,
  nextAttemptAt: null as Date | null,
  lastAttemptAt: null as Date | null,
  startedAt: null as Date | null,
  aplosContributionId: null as string | null,
  blockedReason: null as string | null,
  requiresManualReview: false,
};

const ELIGIBLE_BUILD_ONE = {
  eligible: true,
  awaitingFees: false,
  reasons: [],
  safeMessage: "Ready to synchronize.",
  contributions: [
    {
      originalDonationDate: "2026-01-15",
      payload: { name: "x", date: "2026-01-15", deposit_account: { account_number: 1000 }, lines: [] },
      payloadHash: "hash-a",
      paymentIds: ["pay-1"],
      totalContributionAmountCents: 10000,
    },
  ],
};

async function importDeps() {
  const { prisma } = await import("@/lib/prisma");
  const { buildSettlementContributions } = await import("../contributionBuilder");
  const { postAplosContribution, AplosContributionPostError } = await import("../contributionsClient");
  const { getReadyConnectionToken } = await import("../resourceService");
  return { prisma, buildSettlementContributions, postAplosContribution, AplosContributionPostError, getReadyConnectionToken };
}

/** Sets up the claim-time record returned by claimSyncRecord's upsert
 * (used for every processSettlement test — claimSyncRecord no longer does
 * a separate findUnique+create, it upserts atomically). */
function mockClaimRecord(prisma: Awaited<ReturnType<typeof importDeps>>["prisma"], overrides: Partial<typeof BASE_RECORD> = {}) {
  vi.mocked(prisma.aplosSyncRecord.upsert).mockResolvedValue({ ...BASE_RECORD, ...overrides } as never);
}

describe("processSettlement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when the church has no AplosConnection row", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null as never);
    const { processSettlement } = await import("../syncEngine");
    await expect(processSettlement("church-1", "stl_1")).rejects.toThrow();
  });

  it("upserts (find-or-create) the sync record, locks it, and marks SYNCED on a clean single-contribution success", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution).mockResolvedValue({ id: 555, amount: 100 } as never);
    vi.mocked(prisma.aplosConnection.updateMany).mockResolvedValue({ count: 1 } as never);

    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");

    expect(result.outcome).toBe("SYNCED");
    expect(prisma.aplosSyncRecord.upsert).toHaveBeenCalled();
    const updateCall = vi.mocked(prisma.aplosSyncRecord.updateMany).mock.calls.find((c) => c[0].data.status === "SYNCED");
    expect(updateCall).toBeTruthy();
    const confirmed = JSON.parse(updateCall![0].data.aplosContributionId as string);
    expect(confirmed).toEqual([{ payloadHash: "hash-a", aplosContributionId: "555" }]);
  });

  it("is a no-op returning ALREADY_SYNCED for an already-SYNCED record", async () => {
    const { prisma, buildSettlementContributions } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "SYNCED" });
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("ALREADY_SYNCED");
    expect(buildSettlementContributions).not.toHaveBeenCalled();
  });

  it("is a no-op returning NEEDS_REVIEW for a record already in NEEDS_REVIEW, never touching it", async () => {
    const { prisma, buildSettlementContributions } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "NEEDS_REVIEW", requiresManualReview: true });
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(buildSettlementContributions).not.toHaveBeenCalled();
    expect(prisma.aplosSyncRecord.update).not.toHaveBeenCalled();
    expect(prisma.aplosSyncRecord.updateMany).not.toHaveBeenCalled();
  });

  it("returns SKIPPED_LOCKED for a PROCESSING record that was locked recently", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "PROCESSING", lastAttemptAt: new Date() });
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("SKIPPED_LOCKED");
  });

  it("freezes a stale PROCESSING record into NEEDS_REVIEW rather than resuming it", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    const staleTime = new Date(Date.now() - 20 * 60 * 1000);
    mockClaimRecord(prisma, { status: "PROCESSING", lastAttemptAt: staleTime });
    vi.mocked(prisma.aplosSyncRecord.update).mockResolvedValue({} as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(prisma.aplosSyncRecord.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "NEEDS_REVIEW", requiresManualReview: true }) }));
  });

  it("returns SKIPPED_NOT_DUE for a RETRY_SCHEDULED record whose nextAttemptAt is in the future", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "RETRY_SCHEDULED", nextAttemptAt: new Date(Date.now() + 60_000) });
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("SKIPPED_NOT_DUE");
  });

  it("returns BLOCKED as a cheap no-op for a BLOCKED record without attempting to lock", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "BLOCKED", blockedReason: "Fund mapping required." });
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("BLOCKED");
    expect(result.safeMessage).toBe("Fund mapping required.");
    expect(prisma.aplosSyncRecord.updateMany).not.toHaveBeenCalled();
  });

  it("returns FAILED as a cheap no-op for a FAILED record without attempting to lock", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "FAILED" });
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("FAILED");
    expect(prisma.aplosSyncRecord.updateMany).not.toHaveBeenCalled();
  });

  it("returns SKIPPED_LOCKED when the conditional lock loses a race (updateMany matches 0 rows)", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 0 } as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("SKIPPED_LOCKED");
  });

  it("marks BLOCKED_AWAITING_FEES when the build is ineligible due to unsynced fees", async () => {
    const { prisma, buildSettlementContributions } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue({ eligible: false, awaitingFees: true, reasons: ["MISSING_PROCESSOR_FEE"], safeMessage: "Fees pending.", contributions: [] } as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("BLOCKED_AWAITING_FEES");
  });

  it("marks BLOCKED (not BLOCKED_AWAITING_FEES) for any other ineligibility reason, including POLICY_UNRESOLVED", async () => {
    const { prisma, buildSettlementContributions } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue({ eligible: false, awaitingFees: false, reasons: ["POLICY_UNRESOLVED"], safeMessage: "Accounting policy unresolved.", contributions: [] } as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("BLOCKED");
  });

  it("reports the record's real current state instead of overwriting it when the ineligibility write loses the PROCESSING race", async () => {
    const { prisma, buildSettlementContributions } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany)
      .mockResolvedValueOnce({ count: 1 } as never) // the claim-lock succeeds
      .mockResolvedValueOnce({ count: 0 } as never); // the ineligibility write then loses the race
    vi.mocked(buildSettlementContributions).mockResolvedValue({ eligible: false, awaitingFees: false, reasons: ["MAPPING_REQUIRED"], safeMessage: "Mapping required.", contributions: [] } as never);
    vi.mocked(prisma.aplosSyncRecord.findUnique).mockResolvedValue({ status: "NEEDS_REVIEW", blockedReason: "Frozen by a concurrent attempt.", lastErrorMessage: null } as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(result.safeMessage).toBe("Frozen by a concurrent attempt.");
  });

  it("marks BLOCKED when the Aplos connection is not ready at token-fetch time", async () => {
    const { prisma, buildSettlementContributions, getReadyConnectionToken, AplosContributionPostError: _unused } = await importDeps();
    void _unused;
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    const { AplosConnectionNotReadyError } = await import("../resourceService");
    vi.mocked(getReadyConnectionToken).mockRejectedValue(new AplosConnectionNotReadyError());
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("BLOCKED");
  });

  it("skips its own token fetch and reuses a supplied preAuth token", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(postAplosContribution).mockResolvedValue({ id: 555, amount: 100 } as never);
    vi.mocked(prisma.aplosConnection.updateMany).mockResolvedValue({ count: 1 } as never);

    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1", { token: "preauth-tok", aplosAccountId: "acct_pre" });

    expect(result.outcome).toBe("SYNCED");
    expect(getReadyConnectionToken).not.toHaveBeenCalled();
    expect(postAplosContribution).toHaveBeenCalledWith(expect.anything(), "preauth-tok", "acct_pre");
  });

  it("schedules a retry when Aplos returns a confirmed, non-ambiguous, retryable error", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken, AplosContributionPostError } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution).mockRejectedValue(new AplosContributionPostError({ category: "TEMPORARY_APLOS_ERROR", retryable: true, safeMessage: "Aplos had a temporary error." }, false));
    vi.mocked(prisma.aplosSyncAttempt.create).mockResolvedValue({} as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("RETRY_SCHEDULED");
    expect(prisma.aplosSyncAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ result: "FAILED" }) }));
  });

  it("marks FAILED (terminal) for a confirmed, non-retryable error", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken, AplosContributionPostError } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution).mockRejectedValue(new AplosContributionPostError({ category: "VALIDATION_ERROR", retryable: false, safeMessage: "Aplos rejected the data." }, false));
    vi.mocked(prisma.aplosSyncAttempt.create).mockResolvedValue({} as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("FAILED");
  });

  it("marks FAILED once MAX_AUTOMATIC_RETRY_ATTEMPTS is reached, even for a retryable error category", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken, AplosContributionPostError } = await importDeps();
    const { MAX_AUTOMATIC_RETRY_ATTEMPTS } = await import("../retryPolicy");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { attemptCount: MAX_AUTOMATIC_RETRY_ATTEMPTS - 1 });
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution).mockRejectedValue(new AplosContributionPostError({ category: "TEMPORARY_APLOS_ERROR", retryable: true, safeMessage: "temp" }, false));
    vi.mocked(prisma.aplosSyncAttempt.create).mockResolvedValue({} as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("FAILED");
  });

  it("marks NEEDS_REVIEW and never retries when Aplos's response is ambiguous", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken, AplosContributionPostError } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution).mockRejectedValue(new AplosContributionPostError({ category: "AMBIGUOUS_RESULT", retryable: false, safeMessage: "unknown" }, true));
    vi.mocked(prisma.aplosSyncAttempt.create).mockResolvedValue({} as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("NEEDS_REVIEW");
    const updateCall = vi.mocked(prisma.aplosSyncRecord.updateMany).mock.calls.find((c) => c[0].data.status === "NEEDS_REVIEW");
    expect(updateCall![0].data.requiresManualReview).toBe(true);
    expect(prisma.aplosSyncAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ result: "AMBIGUOUS_TIMEOUT" }) }));
  });

  it("treats a confirmed success whose returned amount doesn't match what was submitted as needing review, not a clean success", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution).mockResolvedValue({ id: 999, amount: 55 } as never); // submitted was $100
    vi.mocked(prisma.aplosSyncAttempt.create).mockResolvedValue({} as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("NEEDS_REVIEW");
  });

  it("preserves a first contribution's confirmed id when a second contribution in the same settlement fails ambiguously, without re-posting the first", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken, AplosContributionPostError } = await importDeps();
    const twoContributionBuild = {
      ...ELIGIBLE_BUILD_ONE,
      contributions: [
        ELIGIBLE_BUILD_ONE.contributions[0],
        { ...ELIGIBLE_BUILD_ONE.contributions[0], originalDonationDate: "2026-01-16", payloadHash: "hash-b" },
      ],
    };
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma);
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(twoContributionBuild as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution)
      .mockResolvedValueOnce({ id: 111, amount: 100 } as never)
      .mockRejectedValueOnce(new AplosContributionPostError({ category: "AMBIGUOUS_RESULT", retryable: false, safeMessage: "unknown" }, true));
    vi.mocked(prisma.aplosSyncAttempt.create).mockResolvedValue({} as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("NEEDS_REVIEW");
    const updateCall = vi.mocked(prisma.aplosSyncRecord.updateMany).mock.calls.find((c) => c[0].data.status === "NEEDS_REVIEW");
    const confirmed = JSON.parse(updateCall![0].data.aplosContributionId as string);
    expect(confirmed).toEqual([{ payloadHash: "hash-a", aplosContributionId: "111" }]);
    expect(postAplosContribution).toHaveBeenCalledTimes(2);
  });

  it("skips already-confirmed contributions on a retry attempt (never re-posts a payloadHash already recorded)", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken } = await importDeps();
    const twoContributionBuild = {
      ...ELIGIBLE_BUILD_ONE,
      contributions: [
        ELIGIBLE_BUILD_ONE.contributions[0],
        { ...ELIGIBLE_BUILD_ONE.contributions[0], originalDonationDate: "2026-01-16", payloadHash: "hash-b" },
      ],
    };
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "RETRY_SCHEDULED" });
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(twoContributionBuild as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({
      aplosContributionId: JSON.stringify([{ payloadHash: "hash-a", aplosContributionId: "111" }]),
    } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution).mockResolvedValue({ id: 222, amount: 100 } as never);
    vi.mocked(prisma.aplosSyncAttempt.create).mockResolvedValue({} as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("SYNCED");
    expect(postAplosContribution).toHaveBeenCalledTimes(1);
    const updateCall = vi.mocked(prisma.aplosSyncRecord.updateMany).mock.calls.find((c) => c[0].data.status === "SYNCED");
    const confirmed = JSON.parse(updateCall![0].data.aplosContributionId as string);
    expect(confirmed).toEqual([
      { payloadHash: "hash-a", aplosContributionId: "111" },
      { payloadHash: "hash-b", aplosContributionId: "222" },
    ]);
  });

  it("marks SYNCED without any Aplos call when every contribution was already confirmed on a prior attempt", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution } = await importDeps();
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "RETRY_SCHEDULED" });
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({
      aplosContributionId: JSON.stringify([{ payloadHash: "hash-a", aplosContributionId: "111" }]),
    } as never);
    vi.mocked(prisma.aplosConnection.updateMany).mockResolvedValue({ count: 1 } as never);
    const { processSettlement } = await import("../syncEngine");
    const result = await processSettlement("church-1", "stl_1");
    expect(result.outcome).toBe("SYNCED");
    expect(postAplosContribution).not.toHaveBeenCalled();
  });
});

describe("requestManualRetry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to retry a NEEDS_REVIEW record", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosSyncRecord.findUnique).mockResolvedValue({ ...BASE_RECORD, churchId: "church-1", status: "NEEDS_REVIEW", requiresManualReview: true } as never);
    const { requestManualRetry } = await import("../syncEngine");
    const result = await requestManualRetry("church-1", "sync-1");
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(prisma.aplosSyncRecord.update).not.toHaveBeenCalled();
  });

  it("refuses to retry any record with requiresManualReview true, regardless of status", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosSyncRecord.findUnique).mockResolvedValue({ ...BASE_RECORD, churchId: "church-1", status: "FAILED", requiresManualReview: true } as never);
    const { requestManualRetry } = await import("../syncEngine");
    const result = await requestManualRetry("church-1", "sync-1");
    expect(result.outcome).toBe("NEEDS_REVIEW");
  });

  it("reports ALREADY_SYNCED for a SYNCED record without re-triggering a sync", async () => {
    const { prisma, buildSettlementContributions } = await importDeps();
    vi.mocked(prisma.aplosSyncRecord.findUnique).mockResolvedValue({ ...BASE_RECORD, churchId: "church-1", status: "SYNCED" } as never);
    const { requestManualRetry } = await import("../syncEngine");
    const result = await requestManualRetry("church-1", "sync-1");
    expect(result.outcome).toBe("ALREADY_SYNCED");
    expect(buildSettlementContributions).not.toHaveBeenCalled();
  });

  it("rejects a request for a sync record belonging to a different church", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.aplosSyncRecord.findUnique).mockResolvedValue({ ...BASE_RECORD, churchId: "church-other" } as never);
    const { requestManualRetry } = await import("../syncEngine");
    await expect(requestManualRetry("church-1", "sync-1")).rejects.toThrow();
  });

  it("resets a FAILED record to PENDING and re-runs processSettlement, which can then succeed", async () => {
    const { prisma, buildSettlementContributions, postAplosContribution, getReadyConnectionToken } = await importDeps();
    vi.mocked(prisma.aplosSyncRecord.findUnique).mockResolvedValue({ ...BASE_RECORD, churchId: "church-1", status: "FAILED" } as never);
    vi.mocked(prisma.aplosSyncRecord.update).mockResolvedValue({} as never);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(CONNECTION as never);
    mockClaimRecord(prisma, { status: "PENDING" });
    vi.mocked(prisma.aplosSyncRecord.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(buildSettlementContributions).mockResolvedValue(ELIGIBLE_BUILD_ONE as never);
    vi.mocked(prisma.aplosSyncRecord.findUniqueOrThrow).mockResolvedValue({ aplosContributionId: null } as never);
    vi.mocked(getReadyConnectionToken).mockResolvedValue({ token: "tok", aplosAccountId: "acct_1" } as never);
    vi.mocked(postAplosContribution).mockResolvedValue({ id: 777, amount: 100 } as never);
    vi.mocked(prisma.aplosConnection.updateMany).mockResolvedValue({ count: 1 } as never);

    const { requestManualRetry } = await import("../syncEngine");
    const result = await requestManualRetry("church-1", "sync-1");
    expect(result.outcome).toBe("SYNCED");
    expect(prisma.aplosSyncRecord.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) }));
  });
});
