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
  { key: "PAYOUT_ACCOUNT_SUBMITTED", label: "Payout Bank Account Submitted", description: "A new payout bank account was submitted for verification." },
  { key: "PAYOUT_ACCOUNT_UNDER_REVIEW", label: "Payout Bank Account Under Review", description: "A payout bank account is under processor review." },
  { key: "PAYOUT_ACCOUNT_DOCUMENTS_REQUIRED", label: "Payout Bank Account Documents Required", description: "The processor requested additional documents for a payout bank account." },
  { key: "PAYOUT_ACCOUNT_APPROVED", label: "Payout Bank Account Approved", description: "A payout bank account was approved by the processor." },
  { key: "PAYOUT_ACCOUNT_ACTIVATED", label: "Payout Bank Account Activated", description: "A new payout bank account became the active deposit destination." },
  { key: "PAYOUT_ACCOUNT_REJECTED", label: "Payout Bank Account Rejected", description: "A payout bank account could not be approved." },
  { key: "PAYOUT_ACCOUNT_REPLACED", label: "Payout Bank Account Replaced", description: "A previous payout bank account was replaced and moved to history." },
  { key: "PAYOUT_DEPOSIT_DELAYED", label: "Payout Deposit Delayed", description: "A scheduled deposit was delayed or failed." },
];

export const DEFAULT_NOTIFICATION_PREFERENCE = { inAppEnabled: true, emailEnabled: true, frequency: "IMMEDIATE" as const };
