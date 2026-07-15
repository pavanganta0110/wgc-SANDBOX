import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(overrides: Record<string, any> = {}) {
  const donors: Record<string, any> = {
    primary: { id: "primary", churchId: "church-A", email: null, phone: null, finixIdentityId: null, normalizedEmail: null, normalizedPhone: null },
    dup: { id: "dup", churchId: "church-A", email: "dup@example.com", phone: "8165551234", finixIdentityId: null, normalizedEmail: "dup@example.com", normalizedPhone: "+18165551234" },
    otherOrgDonor: { id: "otherOrgDonor", churchId: "church-B", email: null, phone: null, finixIdentityId: null },
  };

  const updateCalls: any[] = [];
  const txMock = {
    payment: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    paymentAttempt: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    finixPaymentInstrumentSnapshot: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    donorNote: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
    donor: {
      update: vi.fn((args) => {
        updateCalls.push(args);
        return Promise.resolve({});
      }),
    },
  };

  return {
    donor: {
      findFirst: vi.fn((args: any) => {
        const match = donors[args.where.id];
        if (!match || match.churchId !== args.where.churchId) return Promise.resolve(null);
        return Promise.resolve(match);
      }),
    },
    $transaction: vi.fn((fn: any) => fn(txMock)),
    __tx: txMock,
    __updateCalls: updateCalls,
    ...overrides,
  };
}

describe("mergeDonors — safety rules", () => {
  beforeEach(() => vi.resetModules());

  it("refuses to merge a donor into itself", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { mergeDonors } = await import("@/lib/donors/donorMerge");

    await expect(mergeDonors("primary", "primary", "church-A", "user1", "a@test.com")).rejects.toThrow(/itself/i);
  });

  it("refuses to merge across organizations", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { mergeDonors } = await import("@/lib/donors/donorMerge");

    // otherOrgDonor belongs to church-B, findFirst scoped by church-A won't find it
    await expect(mergeDonors("primary", "otherOrgDonor", "church-A", "user1", "a@test.com")).rejects.toThrow();
  });

  it("reassigns payments, instruments, and notes transactionally, then archives the duplicate", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { mergeDonors } = await import("@/lib/donors/donorMerge");

    const result = await mergeDonors("primary", "dup", "church-A", "user1", "a@test.com");

    expect(result.reassigned.payments).toBe(2);
    expect(result.reassigned.notes).toBe(3);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    const archiveCall = prismaMock.__updateCalls.find((c: any) => c.where.id === "dup" && c.data.archivedAt);
    expect(archiveCall).toBeDefined();
    expect(archiveCall.data.mergedIntoDonorId).toBe("primary");
  });

  it("backfills the primary's missing contact fields from the duplicate without overwriting populated ones", async () => {
    const prismaMock = makePrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { mergeDonors } = await import("@/lib/donors/donorMerge");

    await mergeDonors("primary", "dup", "church-A", "user1", "a@test.com");

    const primaryFillIn = prismaMock.__updateCalls.find((c: any) => c.where.id === "primary");
    expect(primaryFillIn.data.email).toBe("dup@example.com");
    expect(primaryFillIn.data.phone).toBe("8165551234");
  });
});
