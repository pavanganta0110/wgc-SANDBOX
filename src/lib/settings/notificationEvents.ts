export interface NotificationEventDef {
  key: string;
  label: string;
  description: string;
}

/** Only events this codebase can actually detect and act on — no fabricated notification types. */
export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  { key: "DISPUTE_OPENED", label: "New Dispute Opened", description: "A donor has disputed a payment and evidence may be required." },
  { key: "SUBSCRIPTION_PAYMENT_FAILED", label: "Recurring Payment Failed", description: "A scheduled recurring donation payment failed to process." },
  { key: "SETTLEMENT_FUNDED", label: "Settlement Funded", description: "Funds from a settlement batch have been deposited to your bank account." },
  { key: "TEAM_INVITE_ACCEPTED", label: "Team Invitation Accepted", description: "An invited teammate has accepted and set up their account." },
  { key: "SUPPORT_TICKET_REPLY", label: "Support Ticket Reply", description: "WGC Support has replied to one of your support tickets." },
  { key: "BANK_ACCOUNT_CHANGE_SUBMITTED", label: "Bank Account Change Submitted", description: "A bank account change request was submitted for review." },
  { key: "BANK_ACCOUNT_CHANGE_ACTIVATED", label: "Bank Account Change Activated", description: "A new bank account has become the active deposit destination." },
];

export const DEFAULT_NOTIFICATION_PREFERENCE = { inAppEnabled: true, emailEnabled: true, frequency: "IMMEDIATE" as const };
