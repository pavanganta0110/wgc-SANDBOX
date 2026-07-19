import { describe, it, expect } from "vitest";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";

describe("getOrganizationPermissions", () => {
  it("wgc_admin is view-only across every organization-owned action", () => {
    const p = getOrganizationPermissions("wgc_admin");
    expect(p.canView).toBe(true);
    expect(p.canEditProfile).toBe(false);
    expect(p.canRequestRestrictedChange).toBe(false);
    expect(p.canUpdateBankAccount).toBe(false);
    expect(p.canManageContacts).toBe(false);
    expect(p.canUploadDocuments).toBe(false);
    expect(p.canExport).toBe(false);
  });

  it("Checkpoint 4: legacy church_admin normalizes to admin-equivalent, composed from the centralized matrix — bank-account access is override-gated like every other ADMIN, not unconditionally true", () => {
    const p = getOrganizationPermissions("church_admin");
    expect(p.canView).toBe(true);
    expect(p.canEditProfile).toBe(true); // ADMIN has canManageOrgSettings by default
    expect(p.canRequestRestrictedChange).toBe(true);
    expect(p.canUpdateBankAccount).toBe(false); // canManageBankAccount is override-only for ADMIN
    expect(p.canManageContacts).toBe(true);
    expect(p.canUploadDocuments).toBe(true);
    expect(p.canExport).toBe(true);
  });

  it("OWNER has unconditional bank-account access", () => {
    const p = getOrganizationPermissions("owner");
    expect(p.canUpdateBankAccount).toBe(true);
  });

  it("FUNDRAISER and VIEWER cannot edit the organization profile or bank account", () => {
    for (const role of ["fundraiser", "viewer"] as const) {
      const p = getOrganizationPermissions(role);
      expect(p.canEditProfile).toBe(false);
      expect(p.canUpdateBankAccount).toBe(false);
    }
  });

  it("default-denies for an unrecognized or missing role", () => {
    const denied = getOrganizationPermissions(null);
    expect(Object.values(denied).every((v) => v === false)).toBe(true);
  });
});
