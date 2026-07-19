import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findMany: vi.fn() },
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

describe("buildRefundScope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("CP4B: a FUNDRAISER's refund export is restricted to finixOriginalTransferIds from their own attributed payments — cannot force organization scope", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ finixTransferId: "t1" }, { finixTransferId: "t2" }] as never);
    const { buildRefundScope } = await import("@/lib/auth/scopes");
    const auth = makeAuth();
    // Even if the caller passes "organization" scope, FUNDRAISER is forced
    // to their own data (isForcedToOwnData short-circuits resolveScopedUserId).
    const scope = await buildRefundScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-a", finixOriginalTransferId: { in: ["t1", "t2"] } });
  });

  it("a FUNDRAISER with zero attributed payments gets an impossible filter, not an unscoped export", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never);
    const { buildRefundScope } = await import("@/lib/auth/scopes");
    const auth = makeAuth();
    const scope = await buildRefundScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-a", id: "__no_match__" });
  });

  it("OWNER organization scope includes every church refund, no attribution filter", async () => {
    const { buildRefundScope } = await import("@/lib/auth/scopes");
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const scope = await buildRefundScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-a" });
  });

  it("an OWNER selecting a specific user's scope is restricted to that user's attributed payments, not another user's ID passed by a fundraiser", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.payment.findMany).mockResolvedValue([{ finixTransferId: "t9" }] as never);
    const { buildRefundScope } = await import("@/lib/auth/scopes");
    const auth = makeAuth({ role: "owner", rawRole: "owner", userId: "owner-1" });
    const scope = await buildRefundScope(auth, { kind: "user", userId: "target-user" });
    expect(vi.mocked(prisma.payment.findMany).mock.calls[0][0]).toMatchObject({
      where: { churchId: "church-a", attributedUserId: "target-user" },
    });
    expect(scope).toEqual({ churchId: "church-a", finixOriginalTransferId: { in: ["t9"] } });
  });

  it("cross-church: the churchId always comes from auth, never from any external input", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never);
    const { buildRefundScope } = await import("@/lib/auth/scopes");
    const auth = makeAuth({ role: "owner", rawRole: "owner", churchId: "church-real" });
    const scope = await buildRefundScope(auth, { kind: "organization" });
    expect(scope).toEqual({ churchId: "church-real" });
    expect(JSON.stringify(scope)).not.toContain("church-fake-from-client");
  });
});
