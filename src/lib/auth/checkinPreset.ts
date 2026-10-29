import type { PermissionKey } from "./roles";

/**
 * "Door check-in" login: a person who scans or checks in attendees at an event
 * and sees nothing else. Built on the narrowest base role (viewer) plus the two
 * event permissions, with the viewer's one default grant (own transactions)
 * switched off — so the effective permission set is exactly "see events" and
 * "check attendees in". No new role string is introduced, which keeps every
 * existing role check, invite list and permission type unchanged; the preset is
 * just the permissionsJson that gets stored on the user.
 */
export const CHECKIN_ONLY_BASE_ROLE = "viewer" as const;

export const CHECKIN_ONLY_PERMISSION_OVERRIDES: Partial<Record<PermissionKey, boolean>> = {
  canViewOwnTransactions: false,
  canViewEvents: true,
  canManageEventAttendees: true,
};

export const TEAM_INVITE_PRESETS = ["checkin"] as const;
export type TeamInvitePreset = (typeof TEAM_INVITE_PRESETS)[number];

export function isTeamInvitePreset(value: unknown): value is TeamInvitePreset {
  return typeof value === "string" && (TEAM_INVITE_PRESETS as readonly string[]).includes(value);
}
