import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => {
  const m: any = {
    migrationJob: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    migrationRecord: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn(), groupBy: vi.fn(), count: vi.fn() },
    migrationError: { create: vi.fn(), findMany: vi.fn() },
    church: { findUnique: vi.fn() },
    finixPaymentInstrumentSnapshot: { findUnique: vi.fn(), update: vi.fn() },
    donor: { findFirst: vi.fn() },
    subscriptionAction: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    finixSubscription: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    subscriptionConsent: { create: vi.fn() },
  };
  m.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(m));
  return m;
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const finix = vi.hoisted(() => ({ finixClient: { createSubscription: vi.fn(), cancelSubscription: vi.fn() } }));
vi.mock("@/lib/finix/client", () => finix);
const sync = vi.hoisted(() => ({ syncPaymentInstrument: vi.fn() }));
vi.mock("@/lib/finix/sync/syncPaymentInstruments", () => sync);
const donors = vi.hoisted(() => ({ resolveOrCreateDonor: vi.fn() }));
vi.mock("@/lib/donors/resolveOrCreateDonor", () => donors);
vi.mock("@/lib/onboarding/nonprofitVerificationGuard", () => ({ assertNonprofitApproved: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
const events = vi.hoisted(() => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/events/emitEvent", () => events);

import { cancelImportedSubscriptions, createRecurringImportJob, processRecurringImportChunk } from "../recurringImportRun";

const actor = { userId: "admin1", email: "admin@wgc.test", role: "wgc_super_admin" };
const NOW = new Date("2026-11-24T15:00:00Z");

const row = (over: Record<string, unknown> = {}) => ({
  rowNumber: 2,
  status: "VALID",
  messages: [],
  externalCustomerId: "C1",
  originalTokenId: "tokA",
  donorName: "Jordan Ellis",
  donorEmail: "j@x.org",
  amountCents: 2500,
  frequency: "MONTHLY",
  nextChargeDate: "2026-12-05",
  trialDays: 11,
  fundName: "General Fund",
  fundId: "fund1",
  finixIdentityId: "IDa",
  finixInstrumentId: "PIa",
  fingerprint: "fp1",
  ...over,
});
const record = (over: Record<string, unknown> = {}) => ({ id: "rec1", rowNumber: 2, fingerprint: "fp1", rawDataJson: row(over), status: "VALID" });
const snapshot = (over: Record<string, unknown> = {}) => ({
  finixPaymentInstrumentId: "PIa",
  churchId: "ch1",
  donorId: "donor1",
  finixIdentityId: "IDa",
  enabled: true,
  state: "ENABLED",
  cardLast4: "4444",
  bankLast4: null,
  cardExpirationMonth: 12,
  cardExpirationYear: 2030,
  instrumentUse: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.migrationJob.findFirst.mockResolvedValue({ id: "job1", churchId: "ch1", status: "READY", startedAt: null, createdByUserId: "admin1", totalRecords: 1 });
  prismaMock.church.findUnique.mockResolvedValue({ id: "ch1", name: "Campus OS BUILD", finixMerchantId: "MU123" });
  prismaMock.migrationRecord.findMany.mockResolvedValue([record()]);
  prismaMock.migrationRecord.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.migrationRecord.findFirst.mockResolvedValue(null);
  prismaMock.migrationRecord.groupBy.mockResolvedValue([{ status: "IMPORTED", _count: { _all: 1 } }]);
  prismaMock.subscriptionAction.findUnique.mockResolvedValue(null);
  prismaMock.finixPaymentInstrumentSnapshot.findUnique.mockResolvedValue(snapshot());
  prismaMock.donor.findFirst.mockResolvedValue({ id: "donor1", name: "Jordan Ellis", email: "j@x.org", anonymousPreference: false });
  prismaMock.finixSubscription.create.mockResolvedValue({ id: "sub1" });
  finix.finixClient.createSubscription.mockResolvedValue({ id: "SUBfinix1", state: "ACTIVE", first_charge_at: "2026-12-05T15:00:00Z" });
  sync.syncPaymentInstrument.mockResolvedValue(undefined);
});

const run = () => processRecurringImportChunk("job1", "ch1", actor, { now: NOW });
const recordStatuses = () => prismaMock.migrationRecord.update.mock.calls.map((c: any[]) => c[0].data.status);

describe("creating a job", () => {
  it("stores every row, imports nothing yet, and refuses a file with nothing importable", async () => {
    prismaMock.migrationJob.create.mockResolvedValue({ id: "job1" });
    const preview = { rows: [row(), row({ rowNumber: 3, status: "INVALID" })], counts: { total: 2, VALID: 1, WARNING: 0, INVALID: 1, DUPLICATE: 0 }, unmatchedFunds: [], fileErrors: [], truncated: false } as any;
    const result = await createRecurringImportJob({ churchId: "ch1", actor, fileName: "f.csv", preview, attestation: { text: "ok", confirmedAt: "now" }, fundMap: {} });
    expect(result).toEqual({ jobId: "job1", importable: 1 });
    expect(prismaMock.migrationRecord.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(finix.finixClient.createSubscription).not.toHaveBeenCalled();
    await expect(createRecurringImportJob({ churchId: "ch1", actor, fileName: null, preview: { ...preview, rows: [row({ status: "INVALID" })] }, attestation: { text: "ok", confirmedAt: "now" }, fundMap: {} })).rejects.toThrow("nothing to import");
  });
});

describe("importing a row", () => {
  it("creates the subscription with a trial that ends on the first charge date, then saves it", async () => {
    await run();
    const call = finix.finixClient.createSubscription.mock.calls[0][0];
    expect(call).toMatchObject({ amount: 2500, billing_interval: "MONTHLY", linked_to: "MU123", buyer_details: { identity_id: "IDa", instrument_id: "PIa" } });
    expect(call.subscription_details).toEqual({ collection_method: "BILL_AUTOMATICALLY", trial_details: { interval_type: "DAY", interval_count: 11 } });
    expect(call.tags).toMatchObject({ source: "wgc_recurring_migration", migrationRow: "2" });
    expect(prismaMock.finixSubscription.create.mock.calls[0][0].data).toMatchObject({ churchId: "ch1", donorId: "donor1", fundId: "fund1", consentSource: "MIGRATED", amountCents: 2500, attributedUserId: null });
    expect(prismaMock.subscriptionConsent.create.mock.calls[0][0].data).toMatchObject({ consentSource: "MIGRATED", paymentMethodLastFourSnapshot: "4444" });
    expect(prismaMock.migrationRecord.update.mock.calls.at(-1)![0].data).toMatchObject({ status: "IMPORTED", resultEntityId: "sub1" });
    expect(events.emitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "recurring.created", churchId: "ch1" }));
  });

  it("marks the attempt before calling Finix, so a crash in between is visible", async () => {
    const order: string[] = [];
    prismaMock.subscriptionAction.create.mockImplementation(async () => void order.push("action"));
    finix.finixClient.createSubscription.mockImplementation(async () => {
      order.push("finix");
      return { id: "SUBfinix1", state: "ACTIVE", first_charge_at: "2026-12-05T15:00:00Z" };
    });
    await run();
    expect(order).toEqual(["action", "finix"]);
    expect(prismaMock.subscriptionAction.create.mock.calls[0][0].data).toMatchObject({ idempotencyKey: "migration:job1:2", state: "PENDING" });
  });

  it("does not call Finix inside the database transaction", async () => {
    let inTransaction = false;
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      inTransaction = true;
      try {
        return await fn(prismaMock);
      } finally {
        inTransaction = false;
      }
    });
    finix.finixClient.createSubscription.mockImplementation(async () => {
      expect(inTransaction).toBe(false);
      return { id: "SUBfinix1", state: "ACTIVE", first_charge_at: "2026-12-05T15:00:00Z" };
    });
    await run();
    expect(finix.finixClient.createSubscription).toHaveBeenCalled();
  });

  it("cancels the subscription and fails the row when Finix schedules the first charge on the wrong day", async () => {
    finix.finixClient.createSubscription.mockResolvedValue({ id: "SUBfinix1", state: "ACTIVE", first_charge_at: "2026-11-25T00:00:00Z" });
    await run();
    expect(finix.finixClient.cancelSubscription).toHaveBeenCalledWith("SUBfinix1");
    expect(prismaMock.finixSubscription.create).not.toHaveBeenCalled();
    expect(recordStatuses()).toContain("FAILED");
    expect(prismaMock.migrationError.create.mock.calls[0][0].data.message).toContain("canceled");
  });

  it("also cancels when Finix does not report a first charge date at all", async () => {
    finix.finixClient.createSubscription.mockResolvedValue({ id: "SUBfinix1", state: "ACTIVE" });
    await run();
    expect(finix.finixClient.cancelSubscription).toHaveBeenCalledWith("SUBfinix1");
    expect(prismaMock.finixSubscription.create).not.toHaveBeenCalled();
  });

  it("holds a row for review, and creates nothing, when an earlier attempt never finished", async () => {
    prismaMock.subscriptionAction.findUnique.mockResolvedValue({ state: "PENDING" });
    await run();
    expect(finix.finixClient.createSubscription).not.toHaveBeenCalled();
    expect(recordStatuses()).toContain("NEEDS_REVIEW");
  });

  it("reuses a row whose earlier attempt finished instead of creating a second subscription", async () => {
    prismaMock.subscriptionAction.findUnique.mockResolvedValue({ state: "COMPLETED", newValue: { id: "sub9" } });
    await run();
    expect(finix.finixClient.createSubscription).not.toHaveBeenCalled();
    expect(prismaMock.migrationRecord.update.mock.calls.at(-1)![0].data).toMatchObject({ status: "IMPORTED", resultEntityId: "sub9" });
  });

  it("skips a row that another request already claimed", async () => {
    prismaMock.migrationRecord.updateMany.mockResolvedValue({ count: 0 });
    await run();
    expect(finix.finixClient.createSubscription).not.toHaveBeenCalled();
  });

  it("skips a gift already imported in another job", async () => {
    prismaMock.migrationRecord.findFirst.mockResolvedValue({ id: "other" });
    await run();
    expect(finix.finixClient.createSubscription).not.toHaveBeenCalled();
    expect(recordStatuses()).toContain("DUPLICATE");
  });

  it.each([
    ["the instrument belongs to another Finix identity", { finixIdentityId: "IDother" }],
    ["the card is disabled", { enabled: false }],
    ["the instrument is deleted", { state: "DELETED" }],
    ["the card has expired", { cardExpirationMonth: 1, cardExpirationYear: 2020 }],
    ["the instrument belongs to another organization", { churchId: "other-church" }],
  ])("fails the row, and calls nothing in Finix, when %s", async (_label, over) => {
    prismaMock.finixPaymentInstrumentSnapshot.findUnique.mockResolvedValue(snapshot(over));
    await run();
    expect(finix.finixClient.createSubscription).not.toHaveBeenCalled();
    expect(recordStatuses()).toContain("FAILED");
  });

  it("refuses a first charge date that is no longer in the future", async () => {
    prismaMock.migrationRecord.findMany.mockResolvedValue([record({ nextChargeDate: "2026-11-24" })]);
    await run();
    expect(finix.finixClient.createSubscription).not.toHaveBeenCalled();
    expect(prismaMock.migrationError.create.mock.calls[0][0].data.message).toContain("no longer in the future");
  });

  it("matches the donor from the schedule row when the Finix identity has none", async () => {
    prismaMock.finixPaymentInstrumentSnapshot.findUnique.mockResolvedValue(snapshot({ donorId: null }));
    donors.resolveOrCreateDonor.mockResolvedValue({ id: "donor1", created: true, updated: false });
    await run();
    expect(donors.resolveOrCreateDonor).toHaveBeenCalledWith(expect.objectContaining({ churchId: "ch1", finixIdentityId: "IDa", email: "j@x.org" }));
    expect(finix.finixClient.createSubscription).toHaveBeenCalled();
  });

  it("marks a Finix failure on the row and keeps going", async () => {
    finix.finixClient.createSubscription.mockRejectedValue(new Error("Finix 500"));
    await run();
    expect(prismaMock.subscriptionAction.update.mock.calls[0][0].data).toMatchObject({ state: "FAILED" });
    expect(recordStatuses()).toContain("FAILED");
  });

  it("never imports for another organization's job", async () => {
    prismaMock.migrationJob.findFirst.mockResolvedValue(null);
    await expect(run()).rejects.toThrow("not found");
    expect(prismaMock.migrationJob.findFirst.mock.calls[0][0].where).toMatchObject({ id: "job1", churchId: "ch1" });
  });

  it("never treats a file the merchant sent as an import job", async () => {
    prismaMock.migrationJob.findFirst.mockResolvedValue(null);
    await expect(run()).rejects.toThrow("not found");
    expect(prismaMock.migrationJob.findFirst.mock.calls[0][0].where.status).toEqual({ notIn: ["SUBMITTED", "SUBMISSION_USED"] });
    await expect(cancelImportedSubscriptions("job1", "ch1", actor, "x")).rejects.toThrow("not found");
    expect(prismaMock.migrationJob.findFirst.mock.calls[1][0].where.status).toEqual({ notIn: ["SUBMITTED", "SUBMISSION_USED"] });
  });
});

describe("cancelling an import", () => {
  it("cancels in Finix and in WGC, and marks the rows rolled back", async () => {
    prismaMock.migrationRecord.findMany.mockResolvedValue([{ id: "rec1", rowNumber: 2, resultEntityId: "sub1" }]);
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ id: "sub1", finixSubscriptionId: "SUBfinix1", canceledAt: null, donorId: "donor1" });
    prismaMock.migrationRecord.count.mockResolvedValue(0);
    const result = await cancelImportedSubscriptions("job1", "ch1", actor, "wrong date");
    expect(finix.finixClient.cancelSubscription).toHaveBeenCalledWith("SUBfinix1");
    expect(prismaMock.finixSubscription.update.mock.calls[0][0].data).toMatchObject({ state: "CANCELED", canceledByUserId: "admin1" });
    expect(prismaMock.migrationRecord.update.mock.calls[0][0].data).toEqual({ status: "ROLLED_BACK" });
    expect(result).toMatchObject({ canceled: 1, failed: 0, remaining: 0 });
  });

  it("reports a failed cancellation and leaves that row imported", async () => {
    prismaMock.migrationRecord.findMany.mockResolvedValue([{ id: "rec1", rowNumber: 2, resultEntityId: "sub1" }]);
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ id: "sub1", finixSubscriptionId: "SUBfinix1", canceledAt: null, donorId: "donor1" });
    prismaMock.migrationRecord.count.mockResolvedValue(1);
    finix.finixClient.cancelSubscription.mockRejectedValue(new Error("Finix down"));
    const result = await cancelImportedSubscriptions("job1", "ch1", actor, "wrong date");
    expect(result).toMatchObject({ canceled: 0, failed: 1, remaining: 1 });
    expect(prismaMock.migrationError.create).toHaveBeenCalled();
    expect(prismaMock.migrationRecord.update).not.toHaveBeenCalled();
  });
});
