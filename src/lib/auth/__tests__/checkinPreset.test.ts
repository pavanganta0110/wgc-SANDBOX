import { describe, it, expect } from "vitest";
import { CHECKIN_ONLY_BASE_ROLE, CHECKIN_ONLY_PERMISSION_OVERRIDES, isTeamInvitePreset } from "../checkinPreset";
import { resolveEffectivePermissions } from "../permissions";

describe("check-in-only preset", () => {
  it("resolves to exactly two permissions: see events and check attendees in", () => {
    const effective = resolveEffectivePermissions({
      role: CHECKIN_ONLY_BASE_ROLE,
      isWgcAdmin: false,
      permissionsJson: CHECKIN_ONLY_PERMISSION_OVERRIDES,
      impersonation: undefined,
    });

    const granted = Object.entries(effective)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
      .sort();
    expect(granted).toEqual(["canManageEventAttendees", "canViewEvents"]);
  });

  it("switches off the viewer's default grant, so the login cannot see transactions", () => {
    const plainViewer = resolveEffectivePermissions({ role: "viewer", isWgcAdmin: false, permissionsJson: {}, impersonation: undefined });
    const checkin = resolveEffectivePermissions({
      role: "viewer",
      isWgcAdmin: false,
      permissionsJson: CHECKIN_ONLY_PERMISSION_OVERRIDES,
      impersonation: undefined,
    });

    expect(plainViewer.canViewOwnTransactions).toBe(true);
    expect(checkin.canViewOwnTransactions).toBe(false);
  });

  it("does not grant anything that touches money, donors, settings or the team", () => {
    const effective = resolveEffectivePermissions({
      role: CHECKIN_ONLY_BASE_ROLE,
      isWgcAdmin: false,
      permissionsJson: CHECKIN_ONLY_PERMISSION_OVERRIDES,
      impersonation: undefined,
    });

    for (const key of ["canIssueRefunds", "canViewDonors", "canViewAllTransactions", "canViewSettlements", "canManageTeam", "canManageBankAccount", "canExportEvents", "canManageEvents"] as const) {
      expect(effective[key]).toBe(false);
    }
  });
});

describe("isTeamInvitePreset", () => {
  it("accepts only known presets", () => {
    expect(isTeamInvitePreset("checkin")).toBe(true);
    expect(isTeamInvitePreset("admin")).toBe(false);
    expect(isTeamInvitePreset(undefined)).toBe(false);
  });
});
