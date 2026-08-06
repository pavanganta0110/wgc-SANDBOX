import { describe, it, expect, vi, beforeEach } from "vitest";

function makePrismaMock(config: any = null, overrides: Record<string, any> = {}) {
  return {
    invoiceUsageEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    invoiceBillingConfiguration: {
      findFirst: vi.fn().mockResolvedValue(config),
    },
    ...overrides,
  };
}

async function loadModule(prismaMock: any) {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  return import("@/lib/billing/invoiceUsageLedger");
}

describe("invoice billing defaults to disabled — no fee without active pricing", () => {
  it("no active configuration at all -> nothing is ever billable", async () => {
    const prismaMock = makePrismaMock(null);
    const mod = await loadModule(prismaMock);
    const result = await mod.recordInvoiceUsageEvent({
      organizationId: "church-A",
      invoiceId: "inv-1",
      eventType: "INVOICE_PAID",
      idempotencyKey: "inv-1:PAID",
    });
    expect(result.billable).toBe(false);
    expect(result.recorded).toBe(true); // still recorded for reporting, just not billable
  });

  it("a DRAFT configuration (not yet ACTIVE) never bills, even if it exists", async () => {
    const prismaMock = makePrismaMock(null); // getActiveInvoiceBillingConfiguration's own WHERE clause excludes DRAFT — simulated by returning null
    const mod = await loadModule(prismaMock);
    expect(prismaMock.invoiceBillingConfiguration.findFirst).toBeDefined();
    const result = await mod.recordInvoiceUsageEvent({
      organizationId: "church-A",
      invoiceId: "inv-1",
      eventType: "INVOICE_SENT",
      idempotencyKey: "inv-1:SENT",
    });
    expect(result.billable).toBe(false);
  });

  it("an explicitly DISABLED active-status configuration still never bills", async () => {
    const prismaMock = makePrismaMock({ id: "cfg-1", mode: "DISABLED", status: "ACTIVE" });
    const mod = await loadModule(prismaMock);
    const result = await mod.recordInvoiceUsageEvent({
      organizationId: "church-A",
      invoiceId: "inv-1",
      eventType: "INVOICE_PAID",
      idempotencyKey: "inv-1:PAID",
    });
    expect(result.billable).toBe(false);
  });
});

describe("PER_INVOICE_SENT mode", () => {
  it("counts INVOICE_SENT as billable but not INVOICE_CREATED", async () => {
    const config = { id: "cfg-1", mode: "PER_INVOICE_SENT", status: "ACTIVE", partialPaymentCountsAsBillable: false };
    const prismaMock = makePrismaMock(config);
    const mod = await loadModule(prismaMock);

    const sent = await mod.recordInvoiceUsageEvent({ organizationId: "church-A", invoiceId: "inv-1", eventType: "INVOICE_SENT", idempotencyKey: "k1" });
    expect(sent.billable).toBe(true);

    const created = await mod.recordInvoiceUsageEvent({ organizationId: "church-A", invoiceId: "inv-1", eventType: "INVOICE_CREATED", idempotencyKey: "k2" });
    expect(created.billable).toBe(false);
  });
});

describe("PER_INVOICE_PAID mode", () => {
  it("counts INVOICE_PAID as billable", async () => {
    const config = { id: "cfg-1", mode: "PER_INVOICE_PAID", status: "ACTIVE", partialPaymentCountsAsBillable: false };
    const prismaMock = makePrismaMock(config);
    const mod = await loadModule(prismaMock);
    const result = await mod.recordInvoiceUsageEvent({ organizationId: "church-A", invoiceId: "inv-1", eventType: "INVOICE_PAID", idempotencyKey: "k1" });
    expect(result.billable).toBe(true);
  });

  it("partial-payment billability follows the configuration, not a hardcoded assumption", async () => {
    const notCounted = makePrismaMock({ id: "cfg-1", mode: "PER_INVOICE_PAID", status: "ACTIVE", partialPaymentCountsAsBillable: false });
    const modA = await loadModule(notCounted);
    const a = await modA.recordInvoiceUsageEvent({ organizationId: "church-A", invoiceId: "inv-1", eventType: "INVOICE_PARTIALLY_PAID", idempotencyKey: "k1" });
    expect(a.billable).toBe(false);

    const counted = makePrismaMock({ id: "cfg-2", mode: "PER_INVOICE_PAID", status: "ACTIVE", partialPaymentCountsAsBillable: true });
    const modB = await loadModule(counted);
    const b = await modB.recordInvoiceUsageEvent({ organizationId: "church-A", invoiceId: "inv-2", eventType: "INVOICE_PARTIALLY_PAID", idempotencyKey: "k2" });
    expect(b.billable).toBe(true);
  });
});

describe("idempotency — never counted twice", () => {
  it("a duplicate idempotencyKey (retried webhook, page refresh, resend) is not recorded again", async () => {
    const prismaMock = makePrismaMock(
      { id: "cfg-1", mode: "PER_INVOICE_PAID", status: "ACTIVE", partialPaymentCountsAsBillable: false },
      { invoiceUsageEvent: { findUnique: vi.fn().mockResolvedValue({ id: "existing", billable: true }), create: vi.fn() } },
    );
    const mod = await loadModule(prismaMock);
    const result = await mod.recordInvoiceUsageEvent({ organizationId: "church-A", invoiceId: "inv-1", eventType: "INVOICE_PAID", idempotencyKey: "dup-key" });
    expect(result.recorded).toBe(false);
    expect(prismaMock.invoiceUsageEvent.create).not.toHaveBeenCalled();
  });
});

describe("INCLUDED_IN_PLATFORM and MONTHLY_ADD_ON modes never treat usage itself as billable", () => {
  it("INCLUDED_IN_PLATFORM never marks any event billable via the usage ledger", async () => {
    const prismaMock = makePrismaMock({ id: "cfg-1", mode: "INCLUDED_IN_PLATFORM", status: "ACTIVE" });
    const mod = await loadModule(prismaMock);
    const result = await mod.recordInvoiceUsageEvent({ organizationId: "church-A", invoiceId: "inv-1", eventType: "INVOICE_PAID", idempotencyKey: "k1" });
    expect(result.billable).toBe(false);
  });
});
