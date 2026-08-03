import { describe, it, expect } from "vitest";
import { computeDerivedInvoiceStatus, canAcceptPayment, canSend, canVoid, canMarkUncollectible, canEditFinancials } from "../invoiceStatus";

describe("computeDerivedInvoiceStatus", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  it("never auto-changes a manual status (DRAFT)", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "DRAFT", balanceCents: 0, totalCents: 1000, hasBeenViewed: false, dueDate: future });
    expect(status).toBe("DRAFT");
  });

  it("never auto-changes VOID even if somehow balance is zero", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "VOID", balanceCents: 0, totalCents: 1000, hasBeenViewed: false, dueDate: past });
    expect(status).toBe("VOID");
  });

  it("becomes SENT for a sent, unviewed, unpaid invoice not yet due", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "SENT", balanceCents: 1000, totalCents: 1000, hasBeenViewed: false, dueDate: future });
    expect(status).toBe("SENT");
  });

  it("becomes VIEWED once the invoice has been opened", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "SENT", balanceCents: 1000, totalCents: 1000, hasBeenViewed: true, dueDate: future });
    expect(status).toBe("VIEWED");
  });

  it("becomes PARTIALLY_PAID when balance is less than total but greater than zero", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "SENT", balanceCents: 400, totalCents: 1000, hasBeenViewed: true, dueDate: future });
    expect(status).toBe("PARTIALLY_PAID");
  });

  it("becomes PAID when balance reaches zero", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "PARTIALLY_PAID", balanceCents: 0, totalCents: 1000, hasBeenViewed: true, dueDate: future });
    expect(status).toBe("PAID");
  });

  it("becomes PAID even past the due date — paid invoices never become past due", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "PAST_DUE", balanceCents: 0, totalCents: 1000, hasBeenViewed: true, dueDate: past });
    expect(status).toBe("PAID");
  });

  it("becomes PAST_DUE for an outstanding invoice whose due date has passed", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "SENT", balanceCents: 1000, totalCents: 1000, hasBeenViewed: false, dueDate: past });
    expect(status).toBe("PAST_DUE");
  });

  it("PAST_DUE takes priority over PARTIALLY_PAID when both apply", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "PARTIALLY_PAID", balanceCents: 400, totalCents: 1000, hasBeenViewed: true, dueDate: past });
    expect(status).toBe("PAST_DUE");
  });

  it("a refund that brings balance back above zero moves PAID back to an outstanding status", () => {
    const status = computeDerivedInvoiceStatus({ currentStatus: "PAID", balanceCents: 300, totalCents: 1000, hasBeenViewed: true, dueDate: future });
    expect(status).toBe("PARTIALLY_PAID");
  });
});

describe("canAcceptPayment", () => {
  it("rejects VOID, DRAFT, SCHEDULED, UNCOLLECTIBLE", () => {
    expect(canAcceptPayment("VOID")).toBe(false);
    expect(canAcceptPayment("DRAFT")).toBe(false);
    expect(canAcceptPayment("SCHEDULED")).toBe(false);
    expect(canAcceptPayment("UNCOLLECTIBLE")).toBe(false);
  });

  it("allows SENT, VIEWED, PARTIALLY_PAID, PAST_DUE", () => {
    expect(canAcceptPayment("SENT")).toBe(true);
    expect(canAcceptPayment("VIEWED")).toBe(true);
    expect(canAcceptPayment("PARTIALLY_PAID")).toBe(true);
    expect(canAcceptPayment("PAST_DUE")).toBe(true);
  });

  it("does not itself block PAID — a zero remaining balance is enforced separately at charge time, not by status", () => {
    expect(canAcceptPayment("PAID")).toBe(true);
  });
});

describe("canSend / canVoid / canMarkUncollectible", () => {
  it("canSend only for DRAFT/SCHEDULED", () => {
    expect(canSend("DRAFT")).toBe(true);
    expect(canSend("SCHEDULED")).toBe(true);
    expect(canSend("SENT")).toBe(false);
  });

  it("canVoid for anything except PAID/VOID", () => {
    expect(canVoid("SENT")).toBe(true);
    expect(canVoid("PARTIALLY_PAID")).toBe(true);
    expect(canVoid("PAID")).toBe(false);
    expect(canVoid("VOID")).toBe(false);
  });

  it("canMarkUncollectible only for outstanding statuses", () => {
    expect(canMarkUncollectible("PAST_DUE")).toBe(true);
    expect(canMarkUncollectible("PAID")).toBe(false);
    expect(canMarkUncollectible("DRAFT")).toBe(false);
  });
});

describe("canEditFinancials", () => {
  it("allows editing a DRAFT invoice with no payments", () => {
    expect(canEditFinancials("DRAFT", false)).toBe(true);
  });

  it("blocks editing once any successful payment exists, regardless of status", () => {
    expect(canEditFinancials("SENT", true)).toBe(false);
    expect(canEditFinancials("PARTIALLY_PAID", true)).toBe(false);
  });

  it("blocks editing a VOID or PAID or UNCOLLECTIBLE invoice even with no payments recorded", () => {
    expect(canEditFinancials("VOID", false)).toBe(false);
    expect(canEditFinancials("PAID", false)).toBe(false);
    expect(canEditFinancials("UNCOLLECTIBLE", false)).toBe(false);
  });

  it("allows editing a SENT invoice that has no payments yet", () => {
    expect(canEditFinancials("SENT", false)).toBe(true);
  });
});
