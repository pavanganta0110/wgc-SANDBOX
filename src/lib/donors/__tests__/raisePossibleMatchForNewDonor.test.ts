import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  donor: { findMany: vi.fn() },
  possibleDonorMatch: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));
vi.mock("@/lib/donors/resolveOrCreateDonor", () => ({ resolveOrCreateDonor: vi.fn() }));

const existing = {
  id: "d-old",
  name: "John Smith",
  email: "john@example.com",
  normalizedEmail: "john@example.com",
  phone: null,
  normalizedPhone: null,
  addressLine1: null,
  city: null,
  state: null,
  postalCode: null,
  finixIdentityId: null,
};

describe("raisePossibleMatchForNewDonor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPrisma.possibleDonorMatch.create.mockResolvedValue({ id: "pm1" });
  });

  it("raises a PENDING review row for an online gift from an existing name on a new email, never touching the donors", async () => {
    mockPrisma.donor.findMany.mockResolvedValue([existing]);
    const { raisePossibleMatchForNewDonor } = await import("../resolveOrCreateDonorWithMatchReview");

    const result = await raisePossibleMatchForNewDonor({
      churchId: "church-a",
      donorId: "d-new",
      name: "John Smith",
      email: "john.work@company.org",
      sourceType: "ONLINE_DONATION",
      sourceId: "pay1",
      donationAmountCents: 5_000,
    });

    expect(result).toEqual({ id: "d-new", possibleMatchId: "pm1" });
    expect(mockPrisma.possibleDonorMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        churchId: "church-a",
        existingDonorId: "d-old",
        candidateDonorId: "d-new",
        sourceType: "ONLINE_DONATION",
        sourceId: "pay1",
        confidence: "MEDIUM",
        status: "PENDING",
        matchReason: "identical name on a different email address",
        donationAmountCents: 5_000,
      }),
    });
  });

  it("only scans the same church's active donors and never the new donor itself", async () => {
    mockPrisma.donor.findMany.mockResolvedValue([]);
    const { raisePossibleMatchForNewDonor } = await import("../resolveOrCreateDonorWithMatchReview");

    await raisePossibleMatchForNewDonor({ churchId: "church-a", donorId: "d-new", name: "John Smith", email: "x@y.com", sourceType: "ONLINE_DONATION" });

    expect(mockPrisma.donor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-a", archivedAt: null, id: { not: "d-new" } } })
    );
  });

  it("raises nothing when no existing donor is a plausible match", async () => {
    mockPrisma.donor.findMany.mockResolvedValue([{ ...existing, name: "Completely Different" }]);
    const { raisePossibleMatchForNewDonor } = await import("../resolveOrCreateDonorWithMatchReview");

    const result = await raisePossibleMatchForNewDonor({ churchId: "church-a", donorId: "d-new", name: "John Smith", email: "x@y.com", sourceType: "ONLINE_DONATION" });

    expect(result).toEqual({ id: "d-new" });
    expect(mockPrisma.possibleDonorMatch.create).not.toHaveBeenCalled();
  });
});
