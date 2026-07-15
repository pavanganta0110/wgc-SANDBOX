import { describe, it, expect } from "vitest";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";

describe("getSettingsPermissions", () => {
  it("wgc_admin can view, sync, and audit but cannot edit organization-owned settings", () => {
    const p = getSettingsPermissions("wgc_admin");
    expect(p.canView).toBe(true);
    expect(p.canEdit).toBe(false);
    expect(p.canTriggerSync).toBe(true);
    expect(p.canViewAudit).toBe(true);
    expect(p.canManageTeam).toBe(false);
  });

  it("church_admin can edit everything except triggering a processor sync", () => {
    const p = getSettingsPermissions("church_admin");
    expect(p.canEdit).toBe(true);
    expect(p.canManageTeam).toBe(true);
    expect(p.canManageSecurity).toBe(true);
    expect(p.canManageBranding).toBe(true);
    expect(p.canTriggerSync).toBe(false);
  });

  it("default-denies for an unrecognized or missing role", () => {
    const denied = getSettingsPermissions(undefined);
    expect(Object.values(denied).every((v) => v === false)).toBe(true);
  });
});
