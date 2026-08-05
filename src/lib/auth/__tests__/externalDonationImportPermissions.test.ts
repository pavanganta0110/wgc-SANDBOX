import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, EXTERNAL_DONATION_PERMISSION_KEYS } from "@/lib/auth/roles";
import { resolveEffectivePermissions } from "@/lib/auth/permissions";
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

describe("canImportExternalDonations / canExportExternalDonations base role matrix", () => {
  it("owner gets both import and export by default", () => {
    expect(ROLE_PERMISSIONS.owner.canImportExternalDonations).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canExportExternalDonations).toBe(true);
  });

  it("admin gets export but NOT import by default — bulk CSV import is treated as sensitive as bank/billing management, not a routine edit", () => {
    expect(ROLE_PERMISSIONS.admin.canExportExternalDonations).toBe(true);
    expect(ROLE_PERMISSIONS.admin.canImportExternalDonations).toBe(false);
  });

  it("fundraiser and viewer get neither by default", () => {
    expect(ROLE_PERMISSIONS.fundraiser.canImportExternalDonations).toBe(false);
    expect(ROLE_PERMISSIONS.fundraiser.canExportExternalDonations).toBe(false);
    expect(ROLE_PERMISSIONS.viewer.canImportExternalDonations).toBe(false);
    expect(ROLE_PERMISSIONS.viewer.canExportExternalDonations).toBe(false);
  });

  it("EXTERNAL_DONATION_PERMISSION_KEYS includes both keys, for the team-permissions editor to enumerate", () => {
    expect(EXTERNAL_DONATION_PERMISSION_KEYS).toContain("canImportExternalDonations");
    expect(EXTERNAL_DONATION_PERMISSION_KEYS).toContain("canExportExternalDonations");
  });
});

describe("canImportExternalDonations override behavior", () => {
  it("an explicit permissionsJson override can grant import access to an admin who lacks it by default", () => {
    const auth = makeAuth({ rawRole: "admin", role: "admin", permissionsJson: { canImportExternalDonations: true } });
    const effective = resolveEffectivePermissions(auth);
    expect(effective.canImportExternalDonations).toBe(true);
  });

  it("without an override, an admin's effective permissions still deny import", () => {
    const auth = makeAuth({ rawRole: "admin", role: "admin", permissionsJson: null });
    const effective = resolveEffectivePermissions(auth);
    expect(effective.canImportExternalDonations).toBe(false);
  });
});
