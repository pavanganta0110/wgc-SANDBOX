/** Mirrors src/lib/donors/donorPermissions.ts — same two real roles, church_admin always labeled "Organization Admin" in UI. */
export type SessionRole = "wgc_admin" | "church_admin";

export interface SupportPermissions {
  canView: boolean;
  canCreateTicket: boolean;
  canReply: boolean;
  canCloseReopen: boolean;
  canUploadAttachment: boolean;
  // wgc_admin viewing an organization's tickets is a support-context action
  // that must always be audited (see logDashboardAction("support.org_context_accessed", ...))
  isSupportContext: boolean;
}

export function getSupportPermissions(role: SessionRole | null | undefined): SupportPermissions {
  if (role === "wgc_admin") {
    return {
      canView: true,
      canCreateTicket: false,
      canReply: true,
      canCloseReopen: true,
      canUploadAttachment: true,
      isSupportContext: true,
    };
  }
  if (role === "church_admin") {
    return {
      canView: true,
      canCreateTicket: true,
      canReply: true,
      canCloseReopen: true,
      canUploadAttachment: true,
      isSupportContext: false,
    };
  }
  return {
    canView: false,
    canCreateTicket: false,
    canReply: false,
    canCloseReopen: false,
    canUploadAttachment: false,
    isSupportContext: false,
  };
}
