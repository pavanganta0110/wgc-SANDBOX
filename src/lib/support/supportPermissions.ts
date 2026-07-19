import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export type SessionRole = "wgc_admin" | "church_admin" | "owner" | "admin" | "fundraiser" | "viewer";

export interface SupportPermissions {
  canView: boolean;
  canCreateTicket: boolean;
  canReply: boolean;
  canCloseReopen: boolean;
  canUploadAttachment: boolean;
  /** OWNER, or ADMIN with canManageOrgSettings — sees/manages every
   * same-church ticket. false = the caller may only act on tickets they
   * created (creatorScoped), enforced by the route via createdByUserId. */
  canViewAllTickets: boolean;
  isSupportContext: boolean;
}

/**
 * Team-access Checkpoint 4D: wgc_admin no longer gets any access through
 * this merchant-facing permission module — internal WGC support access to
 * organization tickets must go through a separate, explicitly audited
 * support-access flow (not yet built), not the normal merchant route.
 * VIEWER has no support-ticket access by default, matching its narrowest-
 * read-scope policy elsewhere. FUNDRAISER may self-serve tickets they
 * created (creator attribution exists via SupportTicket.createdByUserId)
 * but not the organization's full ticket queue.
 */
export function getSupportPermissions(role: SessionRole | null | undefined): SupportPermissions {
  if (role === "wgc_admin") {
    return {
      canView: false,
      canCreateTicket: false,
      canReply: false,
      canCloseReopen: false,
      canUploadAttachment: false,
      canViewAllTickets: false,
      isSupportContext: false,
    };
  }

  const normalized = normalizeMerchantRole(role);
  if (!normalized) {
    return {
      canView: false,
      canCreateTicket: false,
      canReply: false,
      canCloseReopen: false,
      canUploadAttachment: false,
      canViewAllTickets: false,
      isSupportContext: false,
    };
  }

  if (normalized === "viewer") {
    return {
      canView: false,
      canCreateTicket: false,
      canReply: false,
      canCloseReopen: false,
      canUploadAttachment: false,
      canViewAllTickets: false,
      isSupportContext: false,
    };
  }

  const base = ROLE_PERMISSIONS[normalized];
  return {
    canView: true,
    canCreateTicket: true,
    canReply: true,
    canCloseReopen: true,
    canUploadAttachment: true,
    canViewAllTickets: normalized === "owner" || base.canManageOrgSettings,
    isSupportContext: false,
  };
}
