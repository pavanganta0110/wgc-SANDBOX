import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    donor: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    possibleDonorMatch: {
      create: vi.fn((args: any) => Promise.resolve({ id: "match-1", ...args.data })),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

const logDashboardActionMock = vi.fn().mockResolvedValue(undefined);

async function loadModule(prismaMock: ReturnType<typeof makePrismaMock>, resolveOrCreateDonorMock: any) {
  vi.resetModules();
  logDashboardActionMock.mockClear();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  vi.doMock("@/lib/dashboardAudit", () => ({ logDashboardAction: logDashboardActionMock }));
  vi.doMock("@/lib/donors/resolveOrCreateDonor", () => ({ resolveOrCreateDonor: resolveOrCreateDonorMock }));
  return import("@/lib/donors/resolveOrCreateDonorWithMatchReview");
}

beforeEach(() => vi.clearAllMocks());

describe("resolveOrCreateDonorWithMatchReview", () => {
  it("an exact match (HIGH confidence) auto-attaches and never creates a PossibleDonorMatch", async () => {
    const prismaMock = makePrismaMock();
    const resolveOrCreateDonorMock = vi.fn().mockResolvedValue({ id: "existing-donor", created: false, updated: true });
    const { resolveOrCreateDonorWithMatchReview } = await loadModule(prismaMock, resolveOrCreateDonorMock);

    const result = await resolveOrCreateDonorWithMatchReview({
      churchId: "church-a",
      name: "John Smith",
      email: "john@example.com",
      sourceType: "EXTERNAL_DONATION_ENTRY",
    });

    expect(result.id).toBe("existing-donor");
    expect(result.possibleMatchId).toBeUndefined();
    expect(prismaMock.possibleDonorMatch.create).not.toHaveBeenCalled();
    expect(logDashboardActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "donor.auto_matched" }));
  });

  it("no exact match but a MEDIUM fuzzy match against an existing donor raises a PossibleDonorMatch for review", async () => {
    const prismaMock = makePrismaMock({
      donor: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "existing-donor",
            name: "John Smith",
            email: "john@example.com",
            normalizedEmail: "john@example.com",
            phone: "5551234567",
            normalizedPhone: "+15551234567",
            addressLine1: "123 Main St",
            city: "Austin",
            state: "TX",
            postalCode: "78701",
            finixIdentityId: null,
          },
        ]),
      },
    });
    const resolveOrCreateDonorMock = vi.fn().mockResolvedValue({ id: "brand-new-donor", created: true, updated: false });
    const { resolveOrCreateDonorWithMatchReview } = await loadModule(prismaMock, resolveOrCreateDonorMock);

    const result = await resolveOrCreateDonorWithMatchReview({
      churchId: "church-a",
      name: "Jon Smith", // similar, not identical
      addressLine1: "123 Main St",
      city: "Austin",
      postalCode: "78701",
      sourceType: "EXTERNAL_DONATION_ENTRY",
      donationAmountCents: 5000,
    });

    expect(result.id).toBe("brand-new-donor");
    expect(result.possibleMatchId).toBe("match-1");
    expect(prismaMock.possibleDonorMatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          churchId: "church-a",
          existingDonorId: "existing-donor",
          candidateDonorId: "brand-new-donor",
          confidence: "MEDIUM",
          status: "PENDING",
        }),
      }),
    );
    expect(logDashboardActionMock).toHaveBeenCalledWith(expect.objectContaining({ action: "donor.possible_match_created" }));
  });

  it("a brand-new donor with no fuzzy match against anyone creates no PossibleDonorMatch", async () => {
    const prismaMock = makePrismaMock({ donor: { findMany: vi.fn().mockResolvedValue([]) } });
    const resolveOrCreateDonorMock = vi.fn().mockResolvedValue({ id: "brand-new-donor", created: true, updated: false });
    const { resolveOrCreateDonorWithMatchReview } = await loadModule(prismaMock, resolveOrCreateDonorMock);

    const result = await resolveOrCreateDonorWithMatchReview({
      churchId: "church-a",
      name: "Totally New Person",
      sourceType: "EXTERNAL_DONATION_IMPORT",
      sourceId: "batch-1",
    });

    expect(result.possibleMatchId).toBeUndefined();
    expect(prismaMock.possibleDonorMatch.create).not.toHaveBeenCalled();
  });
});
