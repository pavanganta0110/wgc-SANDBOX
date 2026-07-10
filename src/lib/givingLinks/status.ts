export type GivingLinkStatus = "ACTIVE" | "INACTIVE" | "EXPIRED" | "ARCHIVED";

/**
 * The stored `status` column reflects the admin's intent (active/inactive/
 * archived) — expiration is time-based and computed on read so an
 * expiresAt in the past always displays as EXPIRED without needing a cron
 * job to flip the column.
 */
export function resolveGivingLinkStatus(link: {
  status: string | null;
  expiresAt: Date | null;
}): GivingLinkStatus {
  const stored = (link.status || "ACTIVE").toUpperCase();
  if (stored === "ARCHIVED") return "ARCHIVED";
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return "EXPIRED";
  if (stored === "INACTIVE") return "INACTIVE";
  return "ACTIVE";
}

export function isGivingLinkUsable(link: {
  status: string | null;
  expiresAt: Date | null;
  linkType: string | null;
  successfulDonations: number;
  maxSuccessfulUses: number | null;
  totalCollectedCents: number;
  maxCollectedAmountCents: number | null;
}): { usable: boolean; reason?: string } {
  const effective = resolveGivingLinkStatus(link);
  if (effective === "ARCHIVED") return { usable: false, reason: "archived" };
  if (effective === "EXPIRED") return { usable: false, reason: "expired" };
  if (effective === "INACTIVE") return { usable: false, reason: "inactive" };

  if ((link.linkType || "MULTI_USE").toUpperCase() === "ONE_TIME" && link.successfulDonations > 0) {
    return { usable: false, reason: "already_used" };
  }
  if (link.maxSuccessfulUses != null && link.successfulDonations >= link.maxSuccessfulUses) {
    return { usable: false, reason: "max_uses_reached" };
  }
  if (link.maxCollectedAmountCents != null && link.totalCollectedCents >= link.maxCollectedAmountCents) {
    return { usable: false, reason: "max_amount_reached" };
  }
  return { usable: true };
}
