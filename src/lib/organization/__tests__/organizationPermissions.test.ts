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

  it("church_admin has full organization profile access", () => {
    const p = getOrganizationPermissions("church_admin");
    expect(p.canView).toBe(true);
    expect(p.canEditProfile).toBe(true);
    expect(p.canRequestRestrictedChange).toBe(true);
    expect(p.canUpdateBankAccount).toBe(true);
    expect(p.canManageContacts).toBe(true);
    expect(p.canUploadDocuments).toBe(true);
    expect(p.canExport).toBe(true);
  });

  it("default-denies for an unrecognized or missing role", () => {
    const denied = getOrganizationPermissions(null);
    expect(Object.values(denied).every((v) => v === false)).toBe(true);
  });
});
