/**
 * Rule-based email triage for the admin Inbox. No AI: every decision carries a
 * human-readable reason so an admin can see why a message landed where it did.
 * Order matters and is covered by tests:
 *   1. ALLOW rule            -> SUPPORT
 *   2. known org user sender -> SUPPORT
 *   3. ticket number in subject (a reply to an existing ticket) -> SUPPORT
 *   4. BLOCK rule            -> SPAM
 *   5. spam phrases          -> SPAM
 *   6. bulk / auto-reply markers -> BULK
 *   7. support keywords      -> SUPPORT
 *   8. anything else         -> NEEDS_REVIEW (an admin decides)
 */
export type InboxClassification = "SUPPORT" | "NEEDS_REVIEW" | "SPAM" | "BULK";

export interface SenderRule {
  kind: "BLOCK" | "ALLOW";
  pattern: string; // "a@b.com" or "@b.com"
}

export interface ClassifyInput {
  fromEmail: string;
  subject: string;
  body: string;
  rules: SenderRule[];
  /** True when fromEmail belongs to a WGC user (org member). */
  senderIsKnownUser: boolean;
}

export interface ClassifyResult {
  classification: InboxClassification;
  reason: string;
  ticketNumber: string | null;
  category: string;
}

const SPAM_PHRASES = [
  "seo services", "guaranteed ranking", "first page of google", "crypto", "bitcoin", "forex", "casino", "viagra",
  "lottery", "you have won", "claim your prize", "wire transfer urgently", "backlinks", "buy followers", "web design services",
  "make money fast", "work from home", "limited time offer", "loan approval", "adult",
];

const BULK_SENDER_PARTS = ["noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster", "notifications@", "newsletter", "bounce"];
const BULK_SUBJECT_PREFIXES = ["automatic reply", "auto:", "auto-reply", "autoreply", "out of office", "undeliverable", "delivery status notification", "mail delivery failed"];

const SUPPORT_KEYWORDS = [
  "refund", "payout", "deposit", "settlement", "login", "log in", "password", "can't", "cannot", "error", "receipt", "donation",
  "donor", "statement", "help", "issue", "problem", "not working", "fee", "chargeback", "dispute", "verification", "giving link",
  "subscription", "recurring", "bank account", "support", "ticket",
];

const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ["REFUND", ["refund"]],
  ["DISPUTE", ["dispute", "chargeback"]],
  ["SETTLEMENT", ["payout", "settlement"]],
  ["DEPOSIT", ["deposit"]],
  ["ACCOUNT_ACCESS", ["login", "log in", "password", "locked"]],
  ["ANNUAL_STATEMENT", ["statement", "tax receipt"]],
  ["SUBSCRIPTION", ["recurring", "subscription"]],
  ["FEES", ["fee", "pricing"]],
  ["GIVING_LINK", ["giving link", "giving page"]],
  ["VERIFICATION", ["verification", "verify"]],
  ["PAYMENT", ["payment", "donation", "receipt", "charge"]],
];

export const TICKET_NUMBER_PATTERN = /\bWGC-\d{4,}\b/i;

export function normalizeEmail(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim().toLowerCase();
}

export function senderMatchesPattern(email: string, pattern: string): boolean {
  const e = normalizeEmail(email);
  const p = pattern.trim().toLowerCase();
  if (!p) return false;
  return p.startsWith("@") ? e.endsWith(p) : e === p;
}

function includesAny(haystack: string, needles: string[]): string | null {
  for (const n of needles) if (haystack.includes(n)) return n;
  return null;
}

export function guessCategory(text: string): string {
  const t = text.toLowerCase();
  for (const [category, words] of CATEGORY_KEYWORDS) if (includesAny(t, words)) return category;
  return "OTHER";
}

export function classifyEmail(input: ClassifyInput): ClassifyResult {
  const from = normalizeEmail(input.fromEmail);
  const subject = input.subject ?? "";
  const text = `${subject}\n${input.body ?? ""}`.toLowerCase();
  const ticketMatch = subject.match(TICKET_NUMBER_PATTERN) ?? (input.body ?? "").slice(0, 2000).match(TICKET_NUMBER_PATTERN);
  const ticketNumber = ticketMatch ? ticketMatch[0].toUpperCase() : null;
  const category = guessCategory(text);
  const make = (classification: InboxClassification, reason: string): ClassifyResult => ({ classification, reason, ticketNumber, category });

  const allow = input.rules.find((r) => r.kind === "ALLOW" && senderMatchesPattern(from, r.pattern));
  if (allow) return make("SUPPORT", `Sender is on your allow list (${allow.pattern})`);
  if (input.senderIsKnownUser) return make("SUPPORT", "Sender is a WGC user");
  if (ticketNumber) return make("SUPPORT", `Reply to ticket ${ticketNumber}`);

  const block = input.rules.find((r) => r.kind === "BLOCK" && senderMatchesPattern(from, r.pattern));
  if (block) return make("SPAM", `Sender is on your block list (${block.pattern})`);
  const spam = includesAny(text, SPAM_PHRASES);
  if (spam) return make("SPAM", `Contains spam phrase "${spam}"`);

  const bulkSender = includesAny(from, BULK_SENDER_PARTS);
  if (bulkSender) return make("BULK", `Automated sender address (${bulkSender})`);
  const lowerSubject = subject.trim().toLowerCase();
  const bulkSubject = BULK_SUBJECT_PREFIXES.find((p) => lowerSubject.startsWith(p));
  if (bulkSubject) return make("BULK", `Auto-reply subject ("${bulkSubject}")`);
  if (/\bunsubscribe\b/.test(text)) return make("BULK", "Contains an unsubscribe link (bulk mail)");

  const support = includesAny(text, SUPPORT_KEYWORDS);
  if (support) return make("SUPPORT", `Mentions "${support}"`);
  return make("NEEDS_REVIEW", "No rule matched — needs a person to decide");
}
