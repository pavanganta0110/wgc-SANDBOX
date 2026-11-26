/**
 * A team member's invitation state. Someone who set a password has accepted, and so has someone who has
 * already signed in without one (people opened inside a partner's frame sign in with an emailed code or
 * their CRM identity and never set a password), so they are not shown as "Pending".
 */
export function teamInvitationStatus(user: {
  passwordHash: string | null;
  lastLoginAt: Date | null;
  setPasswordTokenExpiresAt: Date | null;
}, now: Date = new Date()): "PENDING" | "EXPIRED" | "ACCEPTED" {
  if (user.passwordHash || user.lastLoginAt) return "ACCEPTED";
  if (!user.setPasswordTokenExpiresAt || user.setPasswordTokenExpiresAt < now) return "EXPIRED";
  return "PENDING";
}
