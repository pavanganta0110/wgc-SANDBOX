import { describe, it, expect } from "vitest";
import { getAuthorizationPermissions } from "@/lib/finix/authorizationPermissions";

describe("CP4C: getAuthorizationPermissions — organization-scope-only fallback for a resource with no attribution field", () => {
  it("owner can view, export, and trigger sync", () => {
    const p = getAuthorizationPermissions("owner");
    expect(p.canView).toBe(true);
    expect(p.canExport).toBe(true);
    expect(p.canTriggerSync).toBe(true);
  });

  it("fundraiser is denied entirely — no partial/unscoped fallback", () => {
    const p = getAuthorizationPermissions("fundraiser");
    expect(p).toEqual({ canView: false, canExport: false, canTriggerSync: false });
  });

  it("viewer is denied entirely", () => {
    const p = getAuthorizationPermissions("viewer");
    expect(p).toEqual({ canView: false, canExport: false, canTriggerSync: false });
  });

  it("wgc_admin is denied from this merchant-only permission module", () => {
    const p = getAuthorizationPermissions("wgc_admin");
    expect(p).toEqual({ canView: false, canExport: false, canTriggerSync: false });
  });

  it("admin (base role grants canViewSettlements by default) can view, matching settlement policy exactly", () => {
    const p = getAuthorizationPermissions("admin");
    expect(p.canView).toBe(true);
  });
});
