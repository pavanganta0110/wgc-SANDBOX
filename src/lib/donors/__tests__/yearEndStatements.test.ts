import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasMissingStatementInfo } from "@/lib/donors/yearEndStatements";

describe("hasMissingStatementInfo", () => {
  it("flags a donor with no email", () => {
    expect(hasMissingStatementInfo({ email: null, name: "Jane Doe" }, "Jane Doe", false)).toBe(true);
  });

  it("flags a donor with an invalid email", () => {
    expect(hasMissingStatementInfo({ email: "not-an-email", name: "Jane Doe" }, "Jane Doe", false)).toBe(true);
  });

  it("flags a non-anonymous donor with no resolvable display name", () => {
    expect(hasMissingStatementInfo({ email: "jane@example.com", name: null }, "—", false)).toBe(true);
  });

  it("does not flag an anonymous donor for a missing display name", () => {
    expect(hasMissingStatementInfo({ email: "jane@example.com", name: null }, "—", true)).toBe(false);
  });

  it("does not flag a donor with a valid email and resolvable name", () => {
    expect(hasMissingStatementInfo({ email: "jane@example.com", name: "Jane Doe" }, "Jane Doe", false)).toBe(false);
  });
});

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    finixPaymentInstrumentSnapshot: {
      findMany: vi.fn().mockResolvedValue([{ finixPaymentInstrumentId: "IN1", cardBrand: "VISA", cardLast4: "1111", bankLast4: null }]),
    },
    finixTransfer: { findMany: vi.fn().mockResolvedValue([]) },
    finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([]) },
    bankReturn: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    fund: { findMany: vi.fn().mockResolvedValue([]) },
    donor: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe("computeYearEndStatement — eligibility and calendar boundaries", () => {
  beforeEach(() => vi.resetModules());

  it("includes only transfers within the requested calendar year", async () => {
    const prismaMock = makePrismaMock({
      finixTransfer: {
        findMany: vi.fn((args: any) => {
          // Simulate real DB filtering by createdAtFinix gte/lte
          const { gte, lte } = args.where.createdAtFinix;
          const all = [
            { finixTransferId: "T1", finixPaymentInstrumentId: "IN1", amountCents: 5000, state: "SUCCEEDED", createdAtFinix: new Date("2025-12-31T23:00:00Z") },
            { finixTransferId: "T2", finixPaymentInstrumentId: "IN1", amountCents: 10000, state: "SUCCEEDED", createdAtFinix: new Date("2026-06-15T12:00:00Z") },
            { finixTransferId: "T3", finixPaymentInstrumentId: "IN1", amountCents: 7000, state: "SUCCEEDED", createdAtFinix: new Date("2027-01-01T12:00:00Z") },
          ];
          return Promise.resolve(all.filter((t) => t.createdAtFinix >= gte && t.createdAtFinix <= lte));
        }),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { computeYearEndStatement } = await import("@/lib/donors/yearEndStatements");

    const result = await computeYearEndStatement("D1", "church-A", 2026);
    expect(result.donationCount).toBe(1);
    expect(result.grossDonatedCents).toBe(10000);
  });

  it("handles a leap year (2028) boundary without error", async () => {
    const prismaMock = makePrismaMock({
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixTransferId: "T1", finixPaymentInstrumentId: "IN1", amountCents: 5000, state: "SUCCEEDED", createdAtFinix: new Date("2028-02-29T12:00:00Z") },
        ]),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { computeYearEndStatement } = await import("@/lib/donors/yearEndStatements");

    const result = await computeYearEndStatement("D1", "church-A", 2028);
    expect(result.donationCount).toBe(1);
    expect(result.grossDonatedCents).toBe(5000);
  });

  it("excludes a fully refunded donation entirely rather than showing a zero line", async () => {
    const prismaMock = makePrismaMock({
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixTransferId: "T1", finixPaymentInstrumentId: "IN1", amountCents: 5000, state: "SUCCEEDED", createdAtFinix: new Date("2026-03-01") },
        ]),
      },
      finixRefundOrReversal: {
        findMany: vi.fn().mockResolvedValue([{ finixOriginalTransferId: "T1", amountCents: 5000 }]),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { computeYearEndStatement } = await import("@/lib/donors/yearEndStatements");

    const result = await computeYearEndStatement("D1", "church-A", 2026);
    expect(result.donationCount).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it("shows a partial refund as a reduced final amount, not an exclusion", async () => {
    const prismaMock = makePrismaMock({
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixTransferId: "T1", finixPaymentInstrumentId: "IN1", amountCents: 10000, state: "SUCCEEDED", createdAtFinix: new Date("2026-03-01") },
        ]),
      },
      finixRefundOrReversal: {
        findMany: vi.fn().mockResolvedValue([{ finixOriginalTransferId: "T1", amountCents: 3000 }]),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { computeYearEndStatement } = await import("@/lib/donors/yearEndStatements");

    const result = await computeYearEndStatement("D1", "church-A", 2026);
    expect(result.donationCount).toBe(1);
    expect(result.lines[0].grossAmountCents).toBe(10000);
    expect(result.lines[0].refundedAmountCents).toBe(3000);
    expect(result.lines[0].finalRecordedAmountCents).toBe(7000);
    expect(result.recordedTotalCents).toBe(7000);
  });

  it("subtracts an ACH return from the recorded total", async () => {
    const prismaMock = makePrismaMock({
      finixTransfer: {
        findMany: vi.fn().mockResolvedValue([
          { finixTransferId: "T1", finixPaymentInstrumentId: "IN1", amountCents: 10000, state: "SUCCEEDED", createdAtFinix: new Date("2026-03-01") },
        ]),
      },
      bankReturn: {
        findMany: vi.fn().mockResolvedValue([{ originalTransferId: "T1", amountCents: 10000 }]),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { computeYearEndStatement } = await import("@/lib/donors/yearEndStatements");

    const result = await computeYearEndStatement("D1", "church-A", 2026);
    // Fully returned — excluded entirely, same as a full refund.
    expect(result.donationCount).toBe(0);
  });

  it("excludes FAILED and PENDING transfers — only SUCCEEDED state is queried", async () => {
    const prismaMock = makePrismaMock({
      finixTransfer: {
        findMany: vi.fn((args: any) => {
          expect(args.where.state).toBe("SUCCEEDED");
          return Promise.resolve([]);
        }),
      },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { computeYearEndStatement } = await import("@/lib/donors/yearEndStatements");

    await computeYearEndStatement("D1", "church-A", 2026);
    expect(prismaMock.finixTransfer.findMany).toHaveBeenCalled();
  });

  it("returns an empty statement for a donor with no payment instrument", async () => {
    const prismaMock = makePrismaMock({
      finixPaymentInstrumentSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
    });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { computeYearEndStatement } = await import("@/lib/donors/yearEndStatements");

    const result = await computeYearEndStatement("D1", "church-A", 2026);
    expect(result.donationCount).toBe(0);
    expect(result.recordedTotalCents).toBe(0);
  });
});
