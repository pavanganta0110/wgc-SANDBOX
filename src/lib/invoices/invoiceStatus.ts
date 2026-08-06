/**
 * Invoice status state machine. Statuses split into two groups:
 *
 * - MANUAL statuses (DRAFT, SCHEDULED, VOID, UNCOLLECTIBLE) only ever change
 *   via an explicit merchant action (send, void, mark uncollectible) —
 *   never recomputed automatically.
 * - DERIVED statuses (SENT, VIEWED, PARTIALLY_PAID, PAID, PAST_DUE) are
 *   computed from the invoice's actual balance, view history, and due date
 *   every time something relevant changes (a payment, a refund, a view, or
 *   the daily past-due sweep) — never advanced by a separate hand-maintained
 *   transition flag, so they can't drift from the real financial state.
 *
 * This "always recompute from source data" design is deliberate: it's what
 * makes "Paid invoices must never become past due" and "Refunded payments
 * must recalculate the invoice balance" true by construction rather than by
 * remembering to update a status field in every code path that touches
 * money.
 */

export type InvoiceStatus = "DRAFT" | "SCHEDULED" | "SENT" | "VIEWED" | "PARTIALLY_PAID" | "PAID" | "PAST_DUE" | "VOID" | "UNCOLLECTIBLE";

export const MANUAL_STATUSES: readonly InvoiceStatus[] = ["DRAFT", "SCHEDULED", "VOID", "UNCOLLECTIBLE"];

/**
 * Computes the correct status for an invoice that has already been sent (or
 * is currently DRAFT/SCHEDULED/VOID/UNCOLLECTIBLE, in which case it's
 * returned unchanged — those are manual-only). Call this after every event
 * that can change balance/view state/date: a payment, a refund, a public-
 * page view, and the daily past-due sweep.
 */
export function computeDerivedInvoiceStatus(params: {
  currentStatus: InvoiceStatus;
  balanceCents: number;
  totalCents: number;
  hasBeenViewed: boolean;
  dueDate: Date;
  now?: Date;
}): InvoiceStatus {
  const { currentStatus, balanceCents, totalCents, hasBeenViewed, dueDate, now = new Date() } = params;

  if (MANUAL_STATUSES.includes(currentStatus)) return currentStatus;

  // Balance reached zero -> PAID, unconditionally, even past the due date —
  // "Paid invoices must never become past due" and PAID always wins once
  // the debt is actually cleared.
  if (totalCents > 0 && balanceCents <= 0) return "PAID";

  const isPastDue = now.getTime() > dueDate.getTime();
  // A partially-paid invoice past its due date is still actionable/overdue
  // for the remaining balance — PAST_DUE takes priority for display, a
  // documented choice since the two are otherwise mutually exclusive
  // status values.
  if (isPastDue) return "PAST_DUE";

  if (balanceCents < totalCents) return "PARTIALLY_PAID";
  return hasBeenViewed ? "VIEWED" : "SENT";
}

/** Whether a payment attempt should even be allowed against this invoice —
 * the single check every payment path (public page, offline recording)
 * must call before doing anything else. */
export function canAcceptPayment(status: InvoiceStatus): boolean {
  return status !== "VOID" && status !== "DRAFT" && status !== "SCHEDULED" && status !== "UNCOLLECTIBLE";
}

/** Whether a merchant can send/resend/schedule-send this invoice. */
export function canSend(status: InvoiceStatus): boolean {
  return status === "DRAFT" || status === "SCHEDULED";
}

/** Whether a merchant can void this invoice — allowed any time before it's
 * fully PAID (a partially-paid invoice can be voided to write off the
 * remainder; a VOID invoice can never be voided again). */
export function canVoid(status: InvoiceStatus): boolean {
  return status !== "PAID" && status !== "VOID";
}

/** Whether a merchant can mark this invoice uncollectible — only makes
 * sense for an invoice that's actually overdue with an outstanding
 * balance. */
export function canMarkUncollectible(status: InvoiceStatus): boolean {
  return status === "PAST_DUE" || status === "SENT" || status === "VIEWED" || status === "PARTIALLY_PAID";
}

/**
 * Whether the invoice's financial content (line items, totals, payment
 * settings, classification) can still be freely edited in place.
 * Once ANY successful payment exists, financial edits are blocked — the
 * caller must create an InvoiceRevision instead of mutating history, per
 * "Do not silently modify historical line items or totals."
 */
export function canEditFinancials(status: InvoiceStatus, hasAnySuccessfulPayment: boolean): boolean {
  if (hasAnySuccessfulPayment) return false;
  return status !== "VOID" && status !== "PAID" && status !== "UNCOLLECTIBLE";
}

/** Non-financial fields (internal notes, reminder settings) remain editable
 * even after payment/void — only the financial snapshot is protected. Takes
 * `_status` for signature symmetry with canEditFinancials even though every
 * status currently allows it, so a future status-specific restriction has
 * an obvious place to go without changing every call site. */
export function canEditNonFinancialFields(_status: InvoiceStatus): boolean {
  return true;
}
