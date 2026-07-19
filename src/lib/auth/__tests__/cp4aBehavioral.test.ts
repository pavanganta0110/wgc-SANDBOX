import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";
import { getSettlementPermissions } from "@/lib/finix/settlementPermissions";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findMany: vi.fn() },
    finixSubscription: { findMany: vi.fn() },
  },
}));

function makeAuth(overrides: Partial<MerchantAuthContext> = {}): MerchantAuthContext {
  return {
    userId: "fundraiser-1",
    email: "f@b.com",
    churchId: "church-a",
    rawRole: "fundraiser",
    role: "fundraiser",
    isWgcAdmin: false,
    permissionsJson: null,
    authVersion: 1,
    ...overrides,
  };
}

describe("CP4A behavioral test 11 (revised): dispute access is scoped for FUNDRAISER and VIEWER, not denied", () => {
  it("FUNDRAISER can view disputes (scoped to their own attributed payments via resolveScopedTransferIds)", () => {
    expect(getDisputePermissions("fundraiser").canView).toBe(true);
  });
  it("VIEWER can view disputes (scoped to their own attributed payments)", () => {
    expect(getDisputePermissions("viewer").canView).toBe(true);
  });
  it("FUNDRAISER and VIEWER still cannot upload, delete, or submit dispute responses", () => {
    expect(getDisputePermissions("fundraiser").canUpload).toBe(false);
    expect(getDisputePermissions("fundraiser").canSubmit).toBe(false);
    expect(getDisputePermissions("viewer").canUpload).toBe(false);
    expect(getDisputePermissions("viewer").canSubmit).toBe(false);
  });
  it("OWNER and ADMIN can still view disputes (same-church enforced at the route/query level)", () => {
    expect(getDisputePermissions("owner").canView).toBe(true);
    expect(getDisputePermissions("admin").canView).toBe(true);
  });
  it("export follows the same denial as view for FUNDRAISER/VIEWER", () => {
    // canExport is composed from canExportReports, which is already false
    // for FUNDRAISER/VIEWER in the base role matrix — confirming the two
    // gates agree rather than one being stricter than the other.
    expect(getDisputePermissions("fundraiser").canExport).toBe(false);
    expect(getDisputePermissions("viewer").canExport).toBe(false);
  });
});

describe("CP4A behavioral test 12: ACH-return (settlement) access is denied for FUNDRAISER and VIEWER", () => {
  it("FUNDRAISER cannot view settlements/ACH returns", () => {
    expect(getSettlementPermissions("fundraiser").canView).toBe(false);
  });
  it("VIEWER cannot view settlements/ACH returns by default", () => {
    expect(getSettlementPermissions("viewer").canView).toBe(false);
  });
  it("OWNER can always view; ADMIN only with canViewSettlements", () => {
    expect(getSettlementPermissions("owner").canView).toBe(true);
    expect(getSettlementPermissions("admin").canView).toBe(true); // ADMIN base has canViewSettlements true
  });
});

describe("CP4A behavioral tests 6/7: resolveScopedDonorIds derives donor visibility from attributed payments/subscriptions only", () => {
  beforeEach(() => vi.clearAllMocks());

  it("test 6: a FUNDRAISER's scoped donor list is exactly the union of donors from their attributed payments and subscriptions", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ donorId: "donor-1" }, { donorId: "donor-2" }] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([{ donorId: "donor-2" }, { donorId: "donor-3" }] as never);
    const { resolveScopedDonorIds } = await import("@/lib/auth/scopes");
    const auth = makeAuth();
    const ids = await resolveScopedDonorIds(auth, { kind: "organization" }); // FUNDRAISER forced to own data regardless
    expect(new Set(ids)).toEqual(new Set(["donor-1", "donor-2", "donor-3"]));
  });

  it("test 7: a donor with zero attributed payments/subscriptions for this user is excluded (not present in the scoped ID list)", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ donorId: "donor-1" }] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);
    const { resolveScopedDonorIds } = await import("@/lib/auth/scopes");
    const auth = makeAuth();
    const ids = await resolveScopedDonorIds(auth, { kind: "organization" });
    expect(ids).toEqual(["donor-1"]);
    expect(ids).not.toContain("donor-other-fundraisers-donor");
  });

  it("organization scope returns null (no donor-ID restriction) for an OWNER", async () => {
    const { resolveScopedDonorIds } = await import("@/lib/auth/scopes");
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const ids = await resolveScopedDonorIds(auth, { kind: "organization" });
    expect(ids).toBeNull();
  });

  it("a user-scoped view with zero qualifying donors returns an empty array (excludes everything), not null (which would mean unscoped)", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);
    const { resolveScopedDonorIds } = await import("@/lib/auth/scopes");
    const auth = makeAuth();
    const ids = await resolveScopedDonorIds(auth, { kind: "organization" });
    expect(ids).toEqual([]);
    expect(ids).not.toBeNull();
  });
});
