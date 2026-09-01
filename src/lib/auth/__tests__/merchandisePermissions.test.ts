import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, WGC_ADMIN_PERMISSIONS } from "../roles";
import { OVERRIDABLE_PERMISSION_KEYS, resolveEffectivePermissions } from "../permissions";

describe("Merchandise/Printful permission keys", () => {
  it("owner and admin can manage merchandise and view orders by default", () => {
    expect(ROLE_PERMISSIONS.owner.canManageMerchandise).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canViewMerchandiseOrders).toBe(true);
    expect(ROLE_PERMISSIONS.admin.canManageMerchandise).toBe(true);
    expect(ROLE_PERMISSIONS.admin.canViewMerchandiseOrders).toBe(true);
  });

  it("fundraiser can view but not manage merchandise by default", () => {
    expect(ROLE_PERMISSIONS.fundraiser.canManageMerchandise).toBe(false);
    expect(ROLE_PERMISSIONS.fundraiser.canViewMerchandiseOrders).toBe(true);
  });

  it("viewer has no merchandise access by default (narrowest-read-scope philosophy)", () => {
    expect(ROLE_PERMISSIONS.viewer.canManageMerchandise).toBe(false);
    expect(ROLE_PERMISSIONS.viewer.canViewMerchandiseOrders).toBe(false);
  });

  it("wgc_admin's fixed internal-support matrix never grants merchandise credential management", () => {
    expect(WGC_ADMIN_PERMISSIONS.canManageMerchandise).toBe(false);
  });

  it("both new keys are overridable via permissionsJson", () => {
    expect(OVERRIDABLE_PERMISSION_KEYS).toContain("canManageMerchandise");
    expect(OVERRIDABLE_PERMISSION_KEYS).toContain("canViewMerchandiseOrders");
  });

  it("an explicit false override on a fundraiser's permissionsJson revokes canViewMerchandiseOrders even though the base role grants it", () => {
    const effective = resolveEffectivePermissions({ role: "fundraiser", isWgcAdmin: false, permissionsJson: { canViewMerchandiseOrders: false } });
    expect(effective.canViewMerchandiseOrders).toBe(false);
  });

  it("an unknown/unnormalizable role denies merchandise access (deny-all fallback)", () => {
    const effective = resolveEffectivePermissions({ role: null, isWgcAdmin: false, permissionsJson: null });
    expect(effective.canManageMerchandise).toBe(false);
    expect(effective.canViewMerchandiseOrders).toBe(false);
  });
});
