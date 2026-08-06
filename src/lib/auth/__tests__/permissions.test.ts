import { describe, it, expect } from "vitest";
import {
  parsePermissionOverrides,
  resolveEffectivePermissions,
  requirePermission,
  hasPermission,
} from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/auth/errors";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

function makeAuth(overrides: Partial<MerchantAuthContext> = {}): MerchantAuthContext {
  return {
    userId: "user-1",
    email: "a@example.com",
    churchId: "church-1",
    rawRole: "admin",
    role: "admin",
    isWgcAdmin: false,
    permissionsJson: null,
    authVersion: 1,
    ...overrides,
  };
}

describe("parsePermissionOverrides", () => {
  it("drops unknown keys instead of throwing", () => {
    const result = parsePermissionOverrides({ canManageBankAccount: true, notARealPermission: true });
    expect(result).toEqual({ canManageBankAccount: true });
    expect((result as Record<string, unknown>).notARealPermission).toBeUndefined();
  });

  it("rejects the structural, non-overridable keys even if present", () => {
    const result = parsePermissionOverrides({ canTransferOwnership: true, canManageOrgSettings: true });
    expect(result).toEqual({});
  });

  it("drops non-boolean values for a known key", () => {
    const result = parsePermissionOverrides({ canManageBankAccount: "yes" });
    expect(result).toEqual({});
  });

  it("handles null/non-object input safely", () => {
    expect(parsePermissionOverrides(null)).toEqual({});
    expect(parsePermissionOverrides(undefined)).toEqual({});
    expect(parsePermissionOverrides("garbage")).toEqual({});
    expect(parsePermissionOverrides([1, 2, 3])).toEqual({});
  });
});

describe("resolveEffectivePermissions", () => {
  it("denies everything for an unrecognized role (null)", () => {
    const auth = makeAuth({ role: null, rawRole: "superadmin" as MerchantAuthContext["rawRole"] });
    const effective = resolveEffectivePermissions(auth);
    expect(Object.values(effective).every((v) => v === false)).toBe(true);
  });

  it("a deny override removes a permission the role normally grants", () => {
    const auth = makeAuth({ role: "admin", permissionsJson: { canViewAllTransactions: false } });
    expect(hasPermission(auth, "canViewAllTransactions")).toBe(false);
  });

  it("an allow override grants a permission the role doesn't normally have", () => {
    const auth = makeAuth({ role: "admin", permissionsJson: { canManageBankAccount: true } });
    expect(hasPermission(auth, "canManageBankAccount")).toBe(true);
  });

  it("wgc_admin ignores permissionsJson entirely — its matrix is fixed", () => {
    const auth = makeAuth({
      role: null,
      isWgcAdmin: true,
      rawRole: "wgc_admin",
      permissionsJson: { canManageBankAccount: true, canTransferOwnership: true },
    });
    expect(hasPermission(auth, "canManageBankAccount")).toBe(false);
    expect(hasPermission(auth, "canTransferOwnership")).toBe(false);
  });

  it("wgc_admin is never treated as an organization owner", () => {
    const auth = makeAuth({ role: null, isWgcAdmin: true, rawRole: "wgc_admin" });
    expect(hasPermission(auth, "canManageTeam")).toBe(false);
    expect(hasPermission(auth, "canTransferOwnership")).toBe(false);
    expect(hasPermission(auth, "canManageRolesAndPermissions")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("throws ForbiddenError when the permission is missing", () => {
    const auth = makeAuth({ role: "fundraiser" });
    expect(() => requirePermission(auth, "canIssueRefunds")).toThrow(ForbiddenError);
  });

  it("does not throw when the permission is granted", () => {
    const auth = makeAuth({ role: "owner" });
    expect(() => requirePermission(auth, "canIssueRefunds")).not.toThrow();
  });
});

describe("canManageIntegrations (Aplos)", () => {
  it("is granted to owner", () => {
    expect(hasPermission(makeAuth({ role: "owner" }), "canManageIntegrations")).toBe(true);
  });

  it("is granted to admin", () => {
    expect(hasPermission(makeAuth({ role: "admin" }), "canManageIntegrations")).toBe(true);
  });

  it("is denied to fundraiser by default", () => {
    expect(hasPermission(makeAuth({ role: "fundraiser" }), "canManageIntegrations")).toBe(false);
  });

  it("is denied to viewer by default", () => {
    expect(hasPermission(makeAuth({ role: "viewer" }), "canManageIntegrations")).toBe(false);
  });

  it("is overridable to true for a fundraiser via permissionsJson (owner-granted exception)", () => {
    const auth = makeAuth({ role: "fundraiser", permissionsJson: { canManageIntegrations: true } });
    expect(hasPermission(auth, "canManageIntegrations")).toBe(true);
  });

  it("is overridable to false for an admin (explicit deny wins over role default)", () => {
    const auth = makeAuth({ role: "admin", permissionsJson: { canManageIntegrations: false } });
    expect(hasPermission(auth, "canManageIntegrations")).toBe(false);
  });

  it("wgc_admin never receives canManageIntegrations — it is an org-side action key, not a WGC-admin one", () => {
    const auth = makeAuth({ role: null, isWgcAdmin: true, rawRole: "wgc_admin", permissionsJson: { canManageIntegrations: true } });
    expect(hasPermission(auth, "canManageIntegrations")).toBe(false);
  });

  it("an unrecognized role denies canManageIntegrations along with everything else", () => {
    const auth = makeAuth({ role: null, rawRole: "superadmin" as MerchantAuthContext["rawRole"] });
    expect(hasPermission(auth, "canManageIntegrations")).toBe(false);
  });
});
