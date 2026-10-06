/**
 * What to tell a donor when the shared donor-info section isn't valid yet.
 * Event registrations can make the registrant's phone optional, so on those
 * the message must not demand one; if name and email are fine, the only
 * problem left is a phone that was typed but is too short.
 */
export function donorInfoMessage(opts: { phoneOptional: boolean; nameAndEmailOk: boolean }): string {
  if (!opts.phoneOptional) return "Enter your name, email, and phone number to continue.";
  return opts.nameAndEmailOk
    ? "Enter a full 10-digit phone number, or leave it blank."
    : "Enter your name and email to continue.";
}
