import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, BILLING_PERMISSION_KEYS } from "@/lib/auth/roles";
import { resolveEffectivePermissions } from "@/lib/auth/permissions";
import {
  resolveWgcAdminBillingPermissions,
  WGC_SUPER_ADMIN_BILLING_PERMISSIONS,
  WGC_ADMIN_BASE_BILLING_PERMISSIONS,
} from "@/lib/auth/billingAdminPermissions";

describe("merchant-side billing permissions — Owner", () => {
  it("owner can manage the subscription (full billing visibility and management)", () => {
    expect(ROLE_PERMISSIONS.owner.canViewSubscription).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canManageSubscription).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canUpdateBillingMethod).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canCancelSubscription).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canViewBillingHistory).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canDownloadBillingReceipts).toBe(true);
    expect(ROLE_PERMISSIONS.owner.canViewInvoiceBilling).toBe(true);
  });
});

describe("merchant-side billing permissions — Organization Admin", () => {
  it("admin can view billing by default but cannot manage/cancel/update without an explicit override", () => {
    expect(ROLE_PERMISSIONS.admin.canViewSubscription).toBe(true);
    expect(ROLE_PERMISSIONS.admin.canViewBillingHistory).toBe(true);
    expect(ROLE_PERMISSIONS.admin.canManageSubscription).toBe(false);
    expect(ROLE_PERMISSIONS.admin.canUpdateBillingMethod).toBe(false);
    expect(ROLE_PERMISSIONS.admin.canCancelSubscription).toBe(false);
  });

  it("an explicit permissionsJson override CAN grant an admin subscription management", () => {
    const effective = resolveEffectivePermissions({
      role: "admin",
      isWgcAdmin: false,
      permissionsJson: { canManageSubscription: true, canCancelSubscription: true },
    });
    expect(effective.canManageSubscription).toBe(true);
    expect(effective.canCancelSubscription).toBe(true);
  });
});

describe("merchant-side billing permissions — Fundraiser and Viewer", () => {
  it("fundraiser has no subscription-management access by default", () => {
    for (const key of BILLING_PERMISSION_KEYS) {
      expect(ROLE_PERMISSIONS.fundraiser[key]).toBe(false);
    }
  });

  it("viewer has no subscription-management access by default", () => {
    for (const key of BILLING_PERMISSION_KEYS) {
      expect(ROLE_PERMISSIONS.viewer[key]).toBe(false);
    }
  });

  it("an unknown/unnormalizable role denies every billing permission", () => {
    const effective = resolveEffectivePermissions({ role: null, isWgcAdmin: false, permissionsJson: null });
    for (const key of BILLING_PERMISSION_KEYS) {
      expect(effective[key]).toBe(false);
    }
  });
});

describe("WGC-admin billing permissions — controls promotions and pricing", () => {
  it("wgc_super_admin has every billing-admin permission", () => {
    const perms = resolveWgcAdminBillingPermissions("wgc_super_admin", null);
    expect(perms).toEqual(WGC_SUPER_ADMIN_BILLING_PERMISSIONS);
    expect(perms.canManagePricing).toBe(true);
    expect(perms.canManagePromotions).toBe(true);
    expect(perms.canGrantFreeMonths).toBe(true);
    expect(perms.canRefundWgcCharges).toBe(true);
  });

  it("a plain wgc_admin defaults to view-only — not every WGC admin gets every financial permission", () => {
    const perms = resolveWgcAdminBillingPermissions("wgc_admin", null);
    expect(perms).toEqual(WGC_ADMIN_BASE_BILLING_PERMISSIONS);
    expect(perms.canManagePricing).toBe(false);
    expect(perms.canManagePromotions).toBe(false);
    expect(perms.canGrantFreeMonths).toBe(false);
    expect(perms.canApplyBillingCredits).toBe(false);
    expect(perms.canRefundWgcCharges).toBe(false);
    expect(perms.canCancelSubscriptions).toBe(false);
  });

  it("a wgc_admin explicitly designated as a billing administrator gets full billing permissions", () => {
    const perms = resolveWgcAdminBillingPermissions("wgc_admin", { isBillingAdmin: true });
    expect(perms.canManagePricing).toBe(true);
    expect(perms.canGrantFreeMonths).toBe(true);
    expect(perms.canRefundWgcCharges).toBe(true);
  });

  it("an unauthorized/unknown role denies every billing-admin permission — unauthorized user cannot grant free months", () => {
    const perms = resolveWgcAdminBillingPermissions("owner", null);
    expect(perms.canGrantFreeMonths).toBe(false);
    expect(perms.canManagePricing).toBe(false);

    const denied = resolveWgcAdminBillingPermissions(null, null);
    expect(denied.canGrantFreeMonths).toBe(false);
    expect(denied.canViewBilling).toBe(false);
  });

  it("isBillingAdmin has no effect for a non-wgc_admin role", () => {
    const perms = resolveWgcAdminBillingPermissions("viewer", { isBillingAdmin: true });
    expect(perms.canManagePricing).toBe(false);
    expect(perms.canViewBilling).toBe(false);
  });
});
