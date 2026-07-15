import { describe, it, expect, vi, beforeEach } from "vitest";

describe("backfillDonorNormalization", () => {
  beforeEach(() => vi.resetModules());

  it("populates normalizedEmail/normalizedPhone for donors missing them", async () => {
    const donors = [
      { id: "D1", email: "Donor@Example.COM", phone: "8165551234", normalizedEmail: null, normalizedPhone: null },
      { id: "D2", email: null, phone: null, normalizedEmail: null, normalizedPhone: null },
    ];
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = { donor: { findMany: vi.fn().mockResolvedValue(donors), update: updateMock } };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillDonorNormalization } = await import("@/lib/donors/donorBackfill");

    const result = await backfillDonorNormalization("church-A");

    expect(result.updated).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "D1" },
      data: { normalizedEmail: "donor@example.com", normalizedPhone: "+18165551234" },
    });
  });

  it("is idempotent — a second run finds nothing left to update", async () => {
    const donors = [{ id: "D1", email: "donor@example.com", phone: "8165551234", normalizedEmail: "donor@example.com", normalizedPhone: "+18165551234" }];
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = { donor: { findMany: vi.fn().mockResolvedValue(donors), update: updateMock } };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillDonorNormalization } = await import("@/lib/donors/donorBackfill");

    const result = await backfillDonorNormalization("church-A");
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("never nulls out an existing normalized value it can't recompute", async () => {
    // email removed but normalizedEmail still set — normalizeEmail(null) = null,
    // so this donor SHOULD get updated to null (matches current email state).
    const donors = [{ id: "D1", email: null, phone: null, normalizedEmail: "old@example.com", normalizedPhone: null }];
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = { donor: { findMany: vi.fn().mockResolvedValue(donors), update: updateMock } };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillDonorNormalization } = await import("@/lib/donors/donorBackfill");

    await backfillDonorNormalization("church-A");
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "D1" }, data: { normalizedEmail: null } });
  });
});

describe("backfillTransferCreatedVia", () => {
  beforeEach(() => vi.resetModules());

  it("extracts created_via from the already-stored raw payload without calling any API", async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { id: "T1", rawJsonRedacted: { created_via: "SUBSCRIPTION" } },
          { id: "T2", rawJsonRedacted: { created_via: "PAYMENT_LINK" } },
        ]),
        update: updateMock,
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillTransferCreatedVia } = await import("@/lib/donors/donorBackfill");

    const result = await backfillTransferCreatedVia("church-A");
    expect(result.updated).toBe(2);
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "T1" }, data: { createdVia: "SUBSCRIPTION" } });
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "T2" }, data: { createdVia: "PAYMENT_LINK" } });
  });

  it("skips transfers with no raw payload or no created_via field, without erroring", async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([{ id: "T1", rawJsonRedacted: null }, { id: "T2", rawJsonRedacted: { other_field: 1 } }]),
        update: updateMock,
      },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillTransferCreatedVia } = await import("@/lib/donors/donorBackfill");

    const result = await backfillTransferCreatedVia("church-A");
    expect(result.noRawPayload).toBe(2);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("backfillOrphanedPayments", () => {
  beforeEach(() => vi.resetModules());

  it("links a payment to the donor via its transfer's payment instrument", async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      payment: {
        findMany: vi.fn().mockResolvedValue([{ id: "P1", finixTransferId: "T1", finixPaymentInstrumentId: null }]),
        update: updateMock,
      },
      finixTransfer: { findMany: vi.fn().mockResolvedValue([{ finixTransferId: "T1", finixPaymentInstrumentId: "IN1" }]) },
      finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue([{ finixPaymentInstrumentId: "IN1", donorId: "D1" }]) },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillOrphanedPayments } = await import("@/lib/donors/donorBackfill");

    const result = await backfillOrphanedPayments("church-A");
    expect(result.linked).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "P1" }, data: { donorId: "D1" } });
  });

  it("leaves a payment unresolved rather than guessing a donor", async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prismaMock = {
      payment: {
        findMany: vi.fn().mockResolvedValue([{ id: "P1", finixTransferId: "T1", finixPaymentInstrumentId: null }]),
        update: updateMock,
      },
      finixTransfer: { findMany: vi.fn().mockResolvedValue([]) },
      finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
    };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillOrphanedPayments } = await import("@/lib/donors/donorBackfill");

    const result = await backfillOrphanedPayments("church-A");
    expect(result.linked).toBe(0);
    expect(result.unresolved).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns immediately when there are no orphaned payments", async () => {
    const prismaMock = { payment: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() }, finixTransfer: { findMany: vi.fn() }, finixPaymentInstrumentSnapshot: { findMany: vi.fn() } };
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { backfillOrphanedPayments } = await import("@/lib/donors/donorBackfill");

    const result = await backfillOrphanedPayments("church-A");
    expect(result).toEqual({ scanned: 0, linked: 0, unresolved: 0 });
    expect(prismaMock.finixTransfer.findMany).not.toHaveBeenCalled();
  });
});
