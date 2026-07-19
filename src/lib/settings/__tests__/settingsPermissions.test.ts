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

  it("Checkpoint 4: church_admin normalizes to admin-equivalent — can edit org settings but canManageTeam is override-gated, not unconditional", () => {
    const p = getSettingsPermissions("church_admin");
    expect(p.canEdit).toBe(true);
    expect(p.canManageTeam).toBe(false); // ADMIN's canManageTeam is override-only per the Checkpoint 2 matrix
    expect(p.canManageSecurity).toBe(true);
    expect(p.canManageBranding).toBe(true);
    expect(p.canTriggerSync).toBe(false);
  });

  it("only OWNER can request account closure", () => {
    expect(getSettingsPermissions("owner").canRequestAccountClosure).toBe(true);
    expect(getSettingsPermissions("admin").canRequestAccountClosure).toBe(false);
  });

  it("FUNDRAISER and VIEWER cannot see or edit Settings at all", () => {
    for (const role of ["fundraiser", "viewer"] as const) {
      const p = getSettingsPermissions(role);
      expect(p.canView).toBe(false);
      expect(p.canEdit).toBe(false);
    }
  });

  it("default-denies for an unrecognized or missing role", () => {
    const denied = getSettingsPermissions(undefined);
    expect(Object.values(denied).every((v) => v === false)).toBe(true);
  });
});
