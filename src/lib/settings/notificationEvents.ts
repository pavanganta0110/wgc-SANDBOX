export interface NotificationEventDef {
  key: string;
  label: string;
  description: string;
  /** Overrides DEFAULT_NOTIFICATION_PREFERENCE.emailEnabled for this event
   * only, when a specific event needs a different default than every other
   * one (e.g. an unusually high-frequency event where opt-out, not opt-in,
   * is still the right call — see resolveNotificationDefault). Every event
   * below currently relies on the shared default rather than this. */
  defaultEmailEnabled?: boolean;
}

/** Only events this codebase can actually detect and act on — no fabricated notification types. */
export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  { key: "DONATION_RECEIVED", label: "Donation Received", description: "A donor completed a gift on one of your giving pages." },
  { key: "DISPUTE_OPENED", label: "New Dispute Opened", description: "A donor has disputed a payment and evidence may be required." },
  { key: "SUBSCRIPTION_PAYMENT_FAILED", label: "Recurring Payment Failed", description: "A scheduled recurring donation payment failed to process." },
  { key: "SETTLEMENT_FUNDED", label: "Settlement Funded", description: "Funds from a settlement batch have been deposited to your bank account." },
  { key: "TEAM_INVITE_ACCEPTED", label: "Team Invitation Accepted", description: "An invited teammate has accepted and set up their account." },
  { key: "SUPPORT_TICKET_REPLY", label: "Support Ticket Reply", description: "WGC Support has replied to one of your support tickets." },
  { key: "PAYOUT_ACCOUNT_SUBMITTED", label: "Payout Bank Account Submitted", description: "A new payout bank account was submitted for verification." },
  { key: "PAYOUT_ACCOUNT_UNDER_REVIEW", label: "Payout Bank Account Under Review", description: "A payout bank account is under processor review." },
  { key: "PAYOUT_ACCOUNT_DOCUMENTS_REQUIRED", label: "Payout Bank Account Documents Required", description: "The processor requested additional documents for a payout bank account." },
  { key: "PAYOUT_ACCOUNT_APPROVED", label: "Payout Bank Account Approved", description: "A payout bank account was approved by the processor." },
  { key: "PAYOUT_ACCOUNT_ACTIVATED", label: "Payout Bank Account Activated", description: "A new payout bank account became the active deposit destination." },
  { key: "PAYOUT_ACCOUNT_REJECTED", label: "Payout Bank Account Rejected", description: "A payout bank account could not be approved." },
  { key: "PAYOUT_ACCOUNT_REPLACED", label: "Payout Bank Account Replaced", description: "A previous payout bank account was replaced and moved to history." },
  { key: "PAYOUT_DEPOSIT_DELAYED", label: "Payout Deposit Delayed", description: "A scheduled deposit was delayed or failed." },
  { key: "NEW_MERCHANDISE_ORDER", label: "New Merchandise Order", description: "A donor purchased merchandise on one of your giving pages." },
];

export const DEFAULT_NOTIFICATION_PREFERENCE = { inAppEnabled: true, emailEnabled: true, frequency: "IMMEDIATE" as const };

/** Resolves the effective default preference for one event, applying its
 * own defaultEmailEnabled override (if any) on top of the shared default.
 * The one place this logic lives — every reader of NOTIFICATION_EVENTS
 * (the settings page, its API route, notifyEvent's dispatch check) calls
 * this instead of re-deriving the same fallback inline, so a future
 * per-event override never has to be wired into three places by hand. */
export function resolveNotificationDefault(event: Pick<NotificationEventDef, "defaultEmailEnabled">) {
  return {
    inAppEnabled: DEFAULT_NOTIFICATION_PREFERENCE.inAppEnabled,
    emailEnabled: event.defaultEmailEnabled ?? DEFAULT_NOTIFICATION_PREFERENCE.emailEnabled,
    frequency: DEFAULT_NOTIFICATION_PREFERENCE.frequency,
  };
}
