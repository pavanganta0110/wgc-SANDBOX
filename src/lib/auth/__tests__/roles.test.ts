import { describe, it, expect } from "vitest";
import { normalizeMerchantRole, ROLE_PERMISSIONS, WGC_ADMIN_PERMISSIONS } from "@/lib/auth/roles";

describe("normalizeMerchantRole", () => {
  it("normalizes legacy church_admin to admin-equivalent", () => {
    expect(normalizeMerchantRole("church_admin")).toBe("admin");
  });

  it("passes through the four new org roles unchanged", () => {
    expect(normalizeMerchantRole("owner")).toBe("owner");
    expect(normalizeMerchantRole("admin")).toBe("admin");
    expect(normalizeMerchantRole("fundraiser")).toBe("fundraiser");
    expect(normalizeMerchantRole("viewer")).toBe("viewer");
  });

  it("never normalizes wgc_admin to an organization role, including owner", () => {
    const normalized = normalizeMerchantRole("wgc_admin");
    expect(normalized).toBeNull();
    expect(normalized).not.toBe("owner");
  });

  it("denies (returns null) for an unknown role string instead of guessing", () => {
    expect(normalizeMerchantRole("superadmin")).toBeNull();
    expect(normalizeMerchantRole(undefined)).toBeNull();
    expect(normalizeMerchantRole(null)).toBeNull();
  });
});

describe("WGC_ADMIN_PERMISSIONS", () => {
  it("has no owner-level mutation permissions", () => {
    expect(WGC_ADMIN_PERMISSIONS.canManageBankAccount).toBe(false);
    expect(WGC_ADMIN_PERMISSIONS.canManageBilling).toBe(false);
    expect(WGC_ADMIN_PERMISSIONS.canTransferOwnership).toBe(false);
    expect(WGC_ADMIN_PERMISSIONS.canManageTeam).toBe(false);
    expect(WGC_ADMIN_PERMISSIONS.canManageRolesAndPermissions).toBe(false);
  });

  it("is read-only support access, not the same object as any org role's matrix", () => {
    expect(WGC_ADMIN_PERMISSIONS).not.toBe(ROLE_PERMISSIONS.owner);
    expect(WGC_ADMIN_PERMISSIONS.canViewAllTransactions).toBe(true);
  });
});

describe("ROLE_PERMISSIONS matrix", () => {
  it("only OWNER can transfer ownership or manage roles/permissions", () => {
    expect(ROLE_PERMISSIONS.owner.canTransferOwnership).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canManageRolesAndPermissions).toBe(true);
    for (const role of ["admin", "fundraiser", "viewer"] as const) {
      expect(ROLE_PERMISSIONS[role].canTransferOwnership).toBe(false);
      expect(ROLE_PERMISSIONS[role].canManageRolesAndPermissions).toBe(false);
    }
  });

  it("VIEWER has no mutation permissions", () => {
    const v = ROLE_PERMISSIONS.viewer;
    expect(v.canCreateGivingLinks).toBe(false);
    expect(v.canEditOwnGivingLinks).toBe(false);
    expect(v.canEditAllGivingLinks).toBe(false);
    expect(v.canIssueRefunds).toBe(false);
    expect(v.canManageBankAccount).toBe(false);
    expect(v.canManageTeam).toBe(false);
  });

  it("FUNDRAISER cannot export, refund, or manage bank/team", () => {
    const f = ROLE_PERMISSIONS.fundraiser;
    expect(f.canExportReports).toBe(false);
    expect(f.canIssueRefunds).toBe(false);
    expect(f.canManageBankAccount).toBe(false);
    expect(f.canManageTeam).toBe(false);
    expect(f.canViewAsUser).toBe(false);
    expect(f.canViewAllTransactions).toBe(false);
  });
});
