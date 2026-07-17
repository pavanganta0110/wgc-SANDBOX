/**
 * Dispute action permissions, scoped to the roles that actually exist in
 * this app's session model today (wgc_admin/church_admin) — not the full
 * six-role model described in some specs, which hasn't been built yet.
 * Both existing roles get full access; this indirection exists so a real
 * per-role split is a one-place change whenever that RBAC work lands,
 * rather than a grep-and-replace across every Disputes file.
 */
export type SessionRole = "wgc_super_admin" | "wgc_admin" | "church_admin";

export interface DisputePermissions {
  canView: boolean;
  canUpload: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canExport: boolean;
}

export function getDisputePermissions(role: SessionRole | null | undefined): DisputePermissions {
  if (role === "church_admin" || role === "wgc_admin" || role === "wgc_super_admin") {
    return { canView: true, canUpload: true, canDelete: true, canSubmit: true, canExport: true };
  }
  return { canView: false, canUpload: false, canDelete: false, canSubmit: false, canExport: false };
}
