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
    finixSubscription: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    subscriptionConsent: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    subscriptionSetupLink: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    annualDonationStatement: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
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

  it("reassigns FinixSubscription, SubscriptionConsent, and SubscriptionSetupLink rows to the primary donor", async () => {
    const prismaMock = makePrismaMock();
    prismaMock.__tx.finixSubscription.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.__tx.subscriptionConsent.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.__tx.subscriptionSetupLink.updateMany.mockResolvedValue({ count: 1 });
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { mergeDonors } = await import("@/lib/donors/donorMerge");

    const result = await mergeDonors("primary", "dup", "church-A", "user1", "a@test.com");

    expect(result.reassigned.subscriptions).toBe(2);
    expect(result.reassigned.subscriptionConsents).toBe(2);
    expect(result.reassigned.subscriptionSetupLinks).toBe(1);
    expect(prismaMock.__tx.finixSubscription.updateMany).toHaveBeenCalledWith({
      where: { donorId: "dup", churchId: "church-A" },
      data: { donorId: "primary" },
    });
  });

  it("reassigns AnnualDonationStatement rows one at a time, leaving a conflicting (taxYear, version) on the archived duplicate rather than dropping it", async () => {
    const prismaMock = makePrismaMock();
    prismaMock.__tx.annualDonationStatement.findMany.mockResolvedValue([
      { id: "stmt-clean", donorId: "dup", taxYear: 2025, version: 1 },
      { id: "stmt-conflict", donorId: "dup", taxYear: 2024, version: 1 },
    ]);
    prismaMock.__tx.annualDonationStatement.findFirst.mockImplementation((args: any) =>
      Promise.resolve(args.where.taxYear === 2024 ? { id: "primary-stmt-2024" } : null)
    );
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    const { mergeDonors } = await import("@/lib/donors/donorMerge");

    const result = await mergeDonors("primary", "dup", "church-A", "user1", "a@test.com");

    expect(result.reassigned.statements).toBe(1);
    expect(result.statementConflicts).toBe(1);
    expect(prismaMock.__tx.annualDonationStatement.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.__tx.annualDonationStatement.update).toHaveBeenCalledWith({
      where: { id: "stmt-clean" },
      data: { donorId: "primary" },
    });
  });
});

describe("findDuplicateDonorGroups — read-only church-wide preview", () => {
  beforeEach(() => vi.resetModules());

  function makeDupPreviewPrismaMock() {
    const donors = [
      { id: "d1", churchId: "church-A", name: "Pavan Reddy", email: "PavanKumarReddy2@gmail.com", phone: null, normalizedEmail: "pavankumarreddi2@gmail.com", createdAt: new Date("2025-01-01") },
      { id: "d2", churchId: "church-A", name: "pavan k", email: "pavankumarreddi2@gmail.com", phone: "8165551234", normalizedEmail: "pavankumarreddi2@gmail.com", createdAt: new Date("2025-03-01") },
      { id: "d3", churchId: "church-A", name: "Someone Else", email: "someone@else.com", phone: null, normalizedEmail: "someone@else.com", createdAt: new Date("2025-02-01") },
    ];
    return {
      donor: { findMany: vi.fn().mockResolvedValue(donors) },
      finixSubscription: { groupBy: vi.fn().mockResolvedValue([{ donorId: "d2", _count: { _all: 1 } }]) },
      payment: { groupBy: vi.fn().mockResolvedValue([{ donorId: "d1", _count: { _all: 3 } }, { donorId: "d2", _count: { _all: 1 } }]) },
    };
  }

  it("groups only donors sharing the same churchId + normalized email, excluding singletons", async () => {
    const prismaMock = makeDupPreviewPrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/donorAggregates", () => ({
      loadDonorAggregatesBatch: vi.fn().mockResolvedValue(
        new Map([
          ["d1", { totalDonatedCents: 3000, firstDonationAt: new Date("2025-01-05"), lastDonationAt: new Date("2025-01-05"), activeSubscriptionCount: 0 }],
          ["d2", { totalDonatedCents: 1000, firstDonationAt: new Date("2025-03-05"), lastDonationAt: new Date("2025-03-05"), activeSubscriptionCount: 1 }],
        ])
      ),
    }));
    const { findDuplicateDonorGroups } = await import("@/lib/donors/donorMerge");

    const groups = await findDuplicateDonorGroups("church-A");

    expect(groups).toHaveLength(1);
    expect(groups[0].normalizedEmail).toBe("pavankumarreddi2@gmail.com");
    expect(groups[0].donors.map((d) => d.id).sort()).toEqual(["d1", "d2"]);
  });

  it("proposes the donor with an active subscription as canonical, even if it has fewer payments", async () => {
    const prismaMock = makeDupPreviewPrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/donorAggregates", () => ({
      loadDonorAggregatesBatch: vi.fn().mockResolvedValue(
        new Map([
          ["d1", { totalDonatedCents: 3000, firstDonationAt: new Date("2025-01-05"), lastDonationAt: new Date("2025-01-05"), activeSubscriptionCount: 0 }],
          ["d2", { totalDonatedCents: 1000, firstDonationAt: new Date("2025-03-05"), lastDonationAt: new Date("2025-03-05"), activeSubscriptionCount: 1 }],
        ])
      ),
    }));
    const { findDuplicateDonorGroups } = await import("@/lib/donors/donorMerge");

    const [group] = await findDuplicateDonorGroups("church-A");

    expect(group.proposedCanonicalDonorId).toBe("d2");
    expect(group.proposedMergeDonorIds).toEqual(["d1"]);
  });

  it("flags a name/phone conflict within the group without merging anything itself", async () => {
    const prismaMock = makeDupPreviewPrismaMock();
    vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
    vi.doMock("@/lib/donors/donorAggregates", () => ({
      loadDonorAggregatesBatch: vi.fn().mockResolvedValue(
        new Map([
          ["d1", { totalDonatedCents: 3000, firstDonationAt: null, lastDonationAt: null, activeSubscriptionCount: 0 }],
          ["d2", { totalDonatedCents: 1000, firstDonationAt: null, lastDonationAt: null, activeSubscriptionCount: 0 }],
        ])
      ),
    }));
    const { findDuplicateDonorGroups } = await import("@/lib/donors/donorMerge");

    const [group] = await findDuplicateDonorGroups("church-A");

    expect(group.conflicts.length).toBeGreaterThan(0);
    expect(prismaMock.donor.findMany).toHaveBeenCalledTimes(1); // read-only — no update/create/delete call exists on this mock at all
  });
});
