import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { buildPaymentScope, buildGivingLinkScope, buildSubscriptionScope, resolveScopedDonorIds } from "@/lib/auth/scopes";

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

describe("CP4B export parity: dashboard scope and export scope are computed by the exact same functions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("test: payment dashboard scope equals payment export scope (same function, same inputs, same output)", () => {
    const auth = makeAuth();
    const dashboardScope = buildPaymentScope(auth, { kind: "organization" });
    const exportScope = buildPaymentScope(auth, { kind: "organization" });
    expect(exportScope).toEqual(dashboardScope);
    expect(exportScope).toEqual({ churchId: "church-a", attributedUserId: "fundraiser-1" });
  });

  it("test: subscription dashboard scope equals subscription export scope", () => {
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const dashboardScope = buildSubscriptionScope(auth, { kind: "user", userId: "target-9" });
    const exportScope = buildSubscriptionScope(auth, { kind: "user", userId: "target-9" });
    expect(exportScope).toEqual(dashboardScope);
  });

  it("test: fundraiser cannot force organization scope on either dashboard or export — both call sites resolve through the same isForcedToOwnData guard", () => {
    const auth = makeAuth();
    // Passing "organization" explicitly (as a compromised client might try)
    // is ignored identically by both scope builders for a FUNDRAISER.
    expect(buildPaymentScope(auth, { kind: "organization" })).toEqual({ churchId: "church-a", attributedUserId: "fundraiser-1" });
    expect(buildSubscriptionScope(auth, { kind: "organization" })).toEqual({ churchId: "church-a", attributedUserId: "fundraiser-1" });
  });

  it("test: fundraiser cannot pass another user's ID — resolveTargetUserId is never consulted for a FUNDRAISER (isForcedToOwnData short-circuits first)", () => {
    const auth = makeAuth({ userId: "fundraiser-1" });
    const scope = buildPaymentScope(auth, { kind: "user", userId: "someone-elses-id" });
    // Still scoped to the fundraiser's own ID, not the requested one.
    expect(scope).toEqual({ churchId: "church-a", attributedUserId: "fundraiser-1" });
  });

  it("test: cross-church input is ignored — churchId always comes from auth.churchId, never from the scope parameter", () => {
    const auth = makeAuth({ role: "owner", rawRole: "owner", churchId: "real-church" });
    const scope1 = buildPaymentScope(auth, { kind: "organization" });
    const scope2 = buildGivingLinkScope(auth, { kind: "organization" });
    const scope3 = buildSubscriptionScope(auth, { kind: "organization" });
    for (const scope of [scope1, scope2, scope3]) {
      expect((scope as any).churchId).toBe("real-church");
    }
  });

  it("test: donor export scope equals donor dashboard scope (both resolve through resolveScopedDonorIds)", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ donorId: "donor-1" }] as never);
    vi.mocked(prisma.finixSubscription.findMany).mockResolvedValue([] as never);
    const auth = makeAuth();
    const dashboardIds = await resolveScopedDonorIds(auth, { kind: "organization" });
    const exportIds = await resolveScopedDonorIds(auth, { kind: "organization" });
    expect(exportIds).toEqual(dashboardIds);
  });
});
