import { describe, it, expect } from "vitest";
import { resolveComplianceStatus, mapFinixComplianceForm, isStaleEnoughToReconcile, COMPLIANCE_RECONCILE_THROTTLE_MS } from "@/lib/finix/sync/complianceForms";

describe("resolveComplianceStatus", () => {
  it("returns NONE when no form exists yet", () => {
    const status = resolveComplianceStatus(null);
    expect(status).toEqual({ state: "NONE", isOverdue: false, isComplete: false, daysUntilDue: null, needsAttention: false });
  });

  it("a COMPLETE form never needs attention regardless of due date", () => {
    const now = Date.now();
    const status = resolveComplianceStatus({ state: "COMPLETE", dueAt: new Date(now - 1000) }, now);
    expect(status.isComplete).toBe(true);
    expect(status.needsAttention).toBe(false);
  });

  it("an OVERDUE form always needs attention", () => {
    const now = Date.now();
    const status = resolveComplianceStatus({ state: "OVERDUE", dueAt: new Date(now - 86400000) }, now);
    expect(status.isOverdue).toBe(true);
    expect(status.needsAttention).toBe(true);
  });

  it("EXPIRED and INVALID states also count as overdue", () => {
    const now = Date.now();
    expect(resolveComplianceStatus({ state: "EXPIRED", dueAt: null }, now).isOverdue).toBe(true);
    expect(resolveComplianceStatus({ state: "INVALID", dueAt: null }, now).isOverdue).toBe(true);
  });

  it("an INCOMPLETE form due more than 30 days out does not need attention yet", () => {
    const now = Date.now();
    const status = resolveComplianceStatus({ state: "INCOMPLETE", dueAt: new Date(now + 60 * 86400000) }, now);
    expect(status.needsAttention).toBe(false);
    expect(status.daysUntilDue).toBeGreaterThan(30);
  });

  it("an INCOMPLETE form due within 30 days needs attention", () => {
    const now = Date.now();
    const status = resolveComplianceStatus({ state: "INCOMPLETE", dueAt: new Date(now + 10 * 86400000) }, now);
    expect(status.needsAttention).toBe(true);
    expect(status.isOverdue).toBe(false);
  });

  it("an INCOMPLETE form with no due date at all has no urgency signal — never guesses", () => {
    const status = resolveComplianceStatus({ state: "INCOMPLETE", dueAt: null });
    expect(status.daysUntilDue).toBeNull();
    expect(status.needsAttention).toBe(false);
  });
});

describe("mapFinixComplianceForm", () => {
  it("maps a raw Finix compliance_form response onto our fields", () => {
    const raw = {
      type: "PCI_SAQ_A",
      version: "2018.10",
      state: "incomplete",
      due_at: "2025-10-05T18:05:01.94105Z",
      valid_from: null,
      valid_until: null,
      files: { unsigned_file: "FILE_abc", signed_file: null },
      pci_saq_a: { name: null, title: null, ip_address: null, user_agent: null, signed_at: null, is_accepted: false },
      created_at: "2025-07-07T18:05:01.96471Z",
      updated_at: "2025-11-18T22:49:40.269788Z",
    };
    const mapped = mapFinixComplianceForm(raw);
    expect(mapped.state).toBe("INCOMPLETE");
    expect(mapped.unsignedFileId).toBe("FILE_abc");
    expect(mapped.signedFileId).toBeNull();
    expect(mapped.isAccepted).toBe(false);
    expect(mapped.dueAt?.toISOString()).toBe(new Date("2025-10-05T18:05:01.94105Z").toISOString());
  });

  it("maps a completed/signed form including signature details", () => {
    const raw = {
      type: "PCI_SAQ_A",
      state: "COMPLETE",
      due_at: "2025-10-05T18:05:01.94105Z",
      valid_from: "2025-09-09T23:17:43.041004Z",
      valid_until: "2026-09-09T23:17:43.041005Z",
      files: { unsigned_file: "FILE_abc", signed_file: "FILE_def" },
      pci_saq_a: {
        name: "John Smith",
        title: "CTO",
        ip_address: "42.1.1.113",
        user_agent: "Mozilla",
        signed_at: "2022-03-18T16:42:55Z",
        is_accepted: true,
      },
    };
    const mapped = mapFinixComplianceForm(raw);
    expect(mapped.state).toBe("COMPLETE");
    expect(mapped.signeeName).toBe("John Smith");
    expect(mapped.signeeTitle).toBe("CTO");
    expect(mapped.isAccepted).toBe(true);
    expect(mapped.signedAt?.toISOString()).toBe(new Date("2022-03-18T16:42:55Z").toISOString());
  });
});

describe("isStaleEnoughToReconcile", () => {
  it("is stale when never reconciled", () => {
    expect(isStaleEnoughToReconcile(null)).toBe(true);
  });
  it("is not stale immediately after reconciling", () => {
    expect(isStaleEnoughToReconcile(new Date())).toBe(false);
  });
  it("is stale once older than the throttle window", () => {
    expect(isStaleEnoughToReconcile(new Date(Date.now() - COMPLIANCE_RECONCILE_THROTTLE_MS - 1000))).toBe(true);
  });
});
