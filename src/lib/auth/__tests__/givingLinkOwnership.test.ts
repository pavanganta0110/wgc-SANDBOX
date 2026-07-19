import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    payment: { update: vi.fn() }, // spied on in test #5 to prove reassignment never touches Payment
  },
}));

function makeAuth(overrides: Partial<MerchantAuthContext> = {}): MerchantAuthContext {
  return {
    userId: "actor-1",
    email: "actor@b.com",
    churchId: "church-a",
    rawRole: "owner",
    role: "owner",
    isWgcAdmin: false,
    permissionsJson: null,
    authVersion: 1,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("resolveGivingLinkOwnerForCreate", () => {
  it("test 1: a FUNDRAISER attempting to assign a link to another user is rejected", async () => {
    const { resolveGivingLinkOwnerForCreate } = await import("@/lib/auth/givingLinkOwnership");
    const auth = makeAuth({ role: "fundraiser", rawRole: "fundraiser", userId: "fundraiser-1" });
    await expect(resolveGivingLinkOwnerForCreate(auth, "someone-else")).rejects.toThrow(
      "Fundraisers can only create giving links owned by themselves."
    );
  });

  it("a FUNDRAISER creating with no owner specified, or themselves, succeeds", async () => {
    const { resolveGivingLinkOwnerForCreate } = await import("@/lib/auth/givingLinkOwnership");
    const auth = makeAuth({ role: "fundraiser", rawRole: "fundraiser", userId: "fundraiser-1" });
    await expect(resolveGivingLinkOwnerForCreate(auth, null)).resolves.toBe("fundraiser-1");
    await expect(resolveGivingLinkOwnerForCreate(auth, "fundraiser-1")).resolves.toBe("fundraiser-1");
  });

  it("test 2 (creation variant): assigning to a user in another church is rejected", async () => {
    const { resolveGivingLinkOwnerForCreate } = await import("@/lib/auth/givingLinkOwnership");
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "admin", rawRole: "admin" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "target", churchId: "church-B", disabledAt: null } as never);
    await expect(resolveGivingLinkOwnerForCreate(auth, "target")).rejects.toThrow(
      "target user does not belong to your organization"
    );
  });

  it("test 3: an OWNER creating a link for a valid user in the same church succeeds", async () => {
    const { resolveGivingLinkOwnerForCreate } = await import("@/lib/auth/givingLinkOwnership");
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "owner", rawRole: "owner" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "target", churchId: "church-a", disabledAt: null } as never);
    await expect(resolveGivingLinkOwnerForCreate(auth, "target")).resolves.toBe("target");
  });

  it("rejects assigning to a disabled user", async () => {
    const { resolveGivingLinkOwnerForCreate } = await import("@/lib/auth/givingLinkOwnership");
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "owner", rawRole: "owner" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "target", churchId: "church-a", disabledAt: new Date() } as never);
    await expect(resolveGivingLinkOwnerForCreate(auth, "target")).rejects.toThrow("disabled user");
  });

  it("test 4: a VIEWER attempting to create a link is rejected", async () => {
    const { resolveGivingLinkOwnerForCreate } = await import("@/lib/auth/givingLinkOwnership");
    const auth = makeAuth({ role: "viewer", rawRole: "viewer" });
    await expect(resolveGivingLinkOwnerForCreate(auth, null)).rejects.toThrow(/permission/i);
  });

  it("an ADMIN without canEditAllGivingLinks (denied via override) cannot assign to another user", async () => {
    const { resolveGivingLinkOwnerForCreate } = await import("@/lib/auth/givingLinkOwnership");
    const auth = makeAuth({
      role: "admin",
      rawRole: "admin",
      permissionsJson: { canEditAllGivingLinks: false },
    });
    await expect(resolveGivingLinkOwnerForCreate(auth, "someone-else")).rejects.toThrow(
      "You don't have permission to assign a giving link to another user."
    );
  });
});

describe("validateGivingLinkReassignment", () => {
  it("is a no-op when the new owner equals the current owner", async () => {
    const { validateGivingLinkReassignment } = await import("@/lib/auth/givingLinkOwnership");
    const auth = makeAuth({ role: "fundraiser", rawRole: "fundraiser" }); // would otherwise be rejected
    await expect(
      validateGivingLinkReassignment(auth, { currentOwnerUserId: "u1", linkChurchId: "church-a" }, "u1")
    ).resolves.toBeUndefined();
  });

  it("test 2: an ADMIN assigning a link to a user in another church is rejected", async () => {
    const { validateGivingLinkReassignment } = await import("@/lib/auth/givingLinkOwnership");
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "admin", rawRole: "admin" }); // base matrix: canEditAllGivingLinks true
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "target", churchId: "church-B", disabledAt: null } as never);
    await expect(
      validateGivingLinkReassignment(auth, { currentOwnerUserId: "u1", linkChurchId: "church-a" }, "target")
    ).rejects.toThrow("does not belong to your organization");
  });

  it("test 9: rejects reassigning a link that doesn't belong to the requester's organization at all", async () => {
    const { validateGivingLinkReassignment } = await import("@/lib/auth/givingLinkOwnership");
    const auth = makeAuth({ role: "owner", rawRole: "owner" });
    await expect(
      validateGivingLinkReassignment(auth, { currentOwnerUserId: "u1", linkChurchId: "church-DIFFERENT" }, "target")
    ).rejects.toThrow("does not belong to your organization");
  });

  it("a FUNDRAISER cannot reassign a link at all, even one they own", async () => {
    const { validateGivingLinkReassignment } = await import("@/lib/auth/givingLinkOwnership");
    const auth = makeAuth({ role: "fundraiser", rawRole: "fundraiser", userId: "u1" });
    await expect(
      validateGivingLinkReassignment(auth, { currentOwnerUserId: "u1", linkChurchId: "church-a" }, "someone-else")
    ).rejects.toThrow("You don't have permission to reassign this giving link.");
  });

  it("an OWNER reassigning to a valid same-church user succeeds", async () => {
    const { validateGivingLinkReassignment } = await import("@/lib/auth/givingLinkOwnership");
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "owner", rawRole: "owner" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "target", churchId: "church-a", disabledAt: null } as never);
    await expect(
      validateGivingLinkReassignment(auth, { currentOwnerUserId: "u1", linkChurchId: "church-a" }, "target")
    ).resolves.toBeUndefined();
  });

  it("test 5 (structural guarantee): reassignment validation never touches the Payment table", async () => {
    const { validateGivingLinkReassignment } = await import("@/lib/auth/givingLinkOwnership");
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "owner", rawRole: "owner" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "target", churchId: "church-a", disabledAt: null } as never);
    await validateGivingLinkReassignment(auth, { currentOwnerUserId: "u1", linkChurchId: "church-a" }, "target");
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
