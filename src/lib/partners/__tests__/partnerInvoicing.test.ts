import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  partner: { findUnique: vi.fn(), findMany: vi.fn() },
  partnerBillableApproval: { findMany: vi.fn() },
  church: { findMany: vi.fn() },
  partnerInvoice: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const finix = vi.hoisted(() => ({ createTransfer: vi.fn(), findTransferByIdempotencyId: vi.fn() }));
vi.mock("@/lib/finix/client", () => ({ finixClient: finix }));
vi.mock("@/lib/billing/wgcBillingConfig", () => ({ getWgcBillingMerchantId: () => "MU_billing", getConfiguredFinixEnvironment: () => "sandbox" }));
const sendEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: sendEmail }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { chargePartnerInvoice, countedMerchants, ensureInvoiceForPeriod, periodOf, periodStart, runPartnerBilling } from "../partnerInvoicing";

const NOW = new Date("2026-11-03T16:30:00Z");

const invoice = (over: Record<string, unknown> = {}) => ({
  id: "inv1",
  partnerId: "p1",
  period: "2026-11",
  merchantCount: 3,
  unitPriceCents: 2500,
  amountCents: 7500,
  currency: "USD",
  status: "PENDING",
  attemptCount: 0,
  attemptBudget: 4,
  lastAttemptAt: null,
  nextAttemptAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.partner.findUnique.mockResolvedValue({ status: "ACTIVE", billingPaymentInstrumentId: "PI_1", pricePerMerchantCents: 2500, name: "Clear Vision", contactEmail: "d@example.test", billingContactEmail: null });
  prismaMock.partnerInvoice.findUnique.mockResolvedValue(invoice());
  prismaMock.partnerInvoice.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.partnerInvoice.update.mockResolvedValue({});
  finix.createTransfer.mockResolvedValue({ id: "TR_1", state: "SUCCEEDED" });
  finix.findTransferByIdempotencyId.mockResolvedValue(null);
});

describe("periods", () => {
  it("names a month in UTC and finds its first instant", () => {
    expect(periodOf(new Date("2026-11-30T23:59:59Z"))).toBe("2026-11");
    expect(periodOf(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
    expect(periodStart("2026-11").toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("countedMerchants", () => {
  it("counts only merchants approved before the month began, still the partner's and active", async () => {
    prismaMock.partnerBillableApproval.findMany.mockResolvedValue([{ churchId: "c1" }, { churchId: "c2" }]);
    prismaMock.church.findMany.mockResolvedValue([{ id: "c1", name: "Grace", partnerReference: "loc_1" }]);
    const merchants = await countedMerchants("p1", "2026-11");
    const approvalWhere = prismaMock.partnerBillableApproval.findMany.mock.calls[0][0].where;
    expect(approvalWhere).toEqual({ partnerId: "p1", status: "PENDING", approvedAt: { lt: new Date("2026-11-01T00:00:00Z") } });
    expect(prismaMock.church.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["c1", "c2"] }, partnerId: "p1", status: "ACTIVE" });
    expect(merchants).toEqual([{ churchId: "c1", name: "Grace", reference: "loc_1" }]);
  });

  it("reads nothing more when no merchant is approved", async () => {
    prismaMock.partnerBillableApproval.findMany.mockResolvedValue([]);
    expect(await countedMerchants("p1", "2026-11")).toEqual([]);
    expect(prismaMock.church.findMany).not.toHaveBeenCalled();
  });
});

describe("ensureInvoiceForPeriod", () => {
  beforeEach(() => {
    prismaMock.partnerInvoice.findUnique.mockResolvedValue(null);
    prismaMock.partnerBillableApproval.findMany.mockResolvedValue([{ churchId: "c1" }, { churchId: "c2" }, { churchId: "c3" }]);
    prismaMock.church.findMany.mockResolvedValue([
      { id: "c1", name: "A", partnerReference: null },
      { id: "c2", name: "B", partnerReference: "loc_2" },
      { id: "c3", name: "C", partnerReference: null },
    ]);
    prismaMock.partnerInvoice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "inv_new", ...data }));
  });

  it("makes the invoice: price x merchants, with the merchants listed", async () => {
    await ensureInvoiceForPeriod("p1", "2026-11");
    const data = prismaMock.partnerInvoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ partnerId: "p1", period: "2026-11", merchantCount: 3, unitPriceCents: 2500, amountCents: 7500 });
    expect(data.lineItemsJson).toHaveLength(3);
  });

  it("never rewrites an invoice that already exists, even if the price changed", async () => {
    prismaMock.partnerInvoice.findUnique.mockResolvedValue(invoice({ amountCents: 5000 }));
    const result = await ensureInvoiceForPeriod("p1", "2026-11");
    expect(result?.amountCents).toBe(5000);
    expect(prismaMock.partnerInvoice.create).not.toHaveBeenCalled();
    expect(prismaMock.partner.findUnique).not.toHaveBeenCalled();
  });

  it("makes nothing without a price, for a suspended partner, or with no merchants", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ status: "ACTIVE", pricePerMerchantCents: null });
    expect(await ensureInvoiceForPeriod("p1", "2026-11")).toBeNull();
    prismaMock.partner.findUnique.mockResolvedValue({ status: "SUSPENDED", pricePerMerchantCents: 2500 });
    expect(await ensureInvoiceForPeriod("p1", "2026-11")).toBeNull();
    prismaMock.partner.findUnique.mockResolvedValue({ status: "ACTIVE", pricePerMerchantCents: 2500 });
    prismaMock.partnerBillableApproval.findMany.mockResolvedValue([]);
    expect(await ensureInvoiceForPeriod("p1", "2026-11")).toBeNull();
    expect(prismaMock.partnerInvoice.create).not.toHaveBeenCalled();
  });

  it("returns the other run's invoice when two runs race", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ status: "ACTIVE", pricePerMerchantCents: 2500 });
    prismaMock.partnerInvoice.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    prismaMock.partnerInvoice.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(invoice({ id: "inv_other" }));
    const result = await ensureInvoiceForPeriod("p1", "2026-11");
    expect(result?.id).toBe("inv_other");
  });
});

describe("chargePartnerInvoice", () => {
  it("does nothing, and touches no card, while charging is switched off", async () => {
    expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: false })).toBe("SKIPPED");
    expect(prismaMock.partnerInvoice.updateMany).not.toHaveBeenCalled();
    expect(finix.createTransfer).not.toHaveBeenCalled();
  });

  it("skips an invoice that is already paid or waived", async () => {
    for (const status of ["SUCCEEDED", "WAIVED"]) {
      prismaMock.partnerInvoice.findUnique.mockResolvedValue(invoice({ status }));
      expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("SKIPPED");
    }
    expect(finix.createTransfer).not.toHaveBeenCalled();
  });

  it("waits for a card instead of charging when none is saved", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ status: "ACTIVE", billingPaymentInstrumentId: null });
    expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("AWAITING_CARD");
    expect(prismaMock.partnerInvoice.update.mock.calls[0][0].data).toEqual({ status: "AWAITING_CARD" });
    expect(finix.createTransfer).not.toHaveBeenCalled();
  });

  it("does not charge when another run already claimed the invoice", async () => {
    prismaMock.partnerInvoice.updateMany.mockResolvedValue({ count: 0 });
    expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("SKIPPED");
    expect(finix.createTransfer).not.toHaveBeenCalled();
  });

  it("charges the saved card once, on WGC's billing merchant, with a per-attempt idempotency id", async () => {
    expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("SUCCEEDED");
    expect(finix.createTransfer).toHaveBeenCalledTimes(1);
    const sent = finix.createTransfer.mock.calls[0][0];
    expect(sent).toMatchObject({ merchant: "MU_billing", amount: 7500, currency: "USD", source: "PI_1", idempotency_id: "partner-invoice:inv1:1" });
    expect(sent.tags).toMatchObject({ wgc_charge_type: "PARTNER_MONTHLY_BILLING", wgc_partner_id: "p1", wgc_partner_invoice_id: "inv1" });
    expect(JSON.stringify(sent)).not.toMatch(/email|name/i);

    const claim = prismaMock.partnerInvoice.updateMany.mock.calls[0][0];
    expect(claim.data).toMatchObject({ status: "CHARGING", attemptCount: { increment: 1 } });
    expect(prismaMock.partnerInvoice.update.mock.calls[0][0].data).toMatchObject({ status: "SUCCEEDED", finixTransferId: "TR_1", chargedAt: NOW });
  });

  it("only ever claims an invoice that is really due", async () => {
    await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true });
    const where = prismaMock.partnerInvoice.updateMany.mock.calls[0][0].where;
    expect(where.id).toBe("inv1");
    expect(where.OR).toEqual([
      { status: { in: ["PENDING", "AWAITING_CARD"] } },
      { status: "FAILED", nextAttemptAt: { lte: NOW } },
      { status: "CHARGING", lastAttemptAt: { lt: new Date(NOW.getTime() - 15 * 60 * 1000) } },
    ]);
  });

  it("never reuses an earlier attempt's idempotency id", async () => {
    prismaMock.partnerInvoice.findUnique.mockResolvedValue(invoice({ status: "FAILED", attemptCount: 1, nextAttemptAt: NOW }));
    await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true });
    expect(finix.createTransfer.mock.calls[0][0].idempotency_id).toBe("partner-invoice:inv1:2");
  });

  it("records a decline and schedules tomorrow's retry", async () => {
    finix.createTransfer.mockResolvedValue({ id: "TR_2", state: "FAILED", failure_message: "Insufficient funds" });
    expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("FAILED");
    const data = prismaMock.partnerInvoice.update.mock.calls[0][0].data;
    expect(data.status).toBe("FAILED");
    expect(data.failureReason).toContain("Insufficient funds");
    expect(data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 24 * 3600 * 1000));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("treats a Finix error the same way", async () => {
    finix.createTransfer.mockRejectedValue(new Error("network down"));
    expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("FAILED");
    expect(prismaMock.partnerInvoice.update.mock.calls[0][0].data).toMatchObject({ status: "FAILED", failureReason: "network down" });
  });

  it("stops retrying once the attempt budget is spent", async () => {
    prismaMock.partnerInvoice.findUnique.mockResolvedValue(invoice({ status: "FAILED", attemptCount: 3, attemptBudget: 4, nextAttemptAt: NOW }));
    finix.createTransfer.mockResolvedValue({ id: "TR_9", state: "FAILED" });
    await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true });
    expect(prismaMock.partnerInvoice.update.mock.calls[0][0].data.nextAttemptAt).toBeNull();
  });

  it("leaves a not-yet-settled charge as it is, without calling it a failure", async () => {
    finix.createTransfer.mockResolvedValue({ id: "TR_3", state: "PENDING" });
    expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("PENDING");
    expect(prismaMock.partnerInvoice.update.mock.calls[0][0].data).toEqual({ finixTransferId: "TR_3" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  describe("an interrupted attempt (a CHARGING row gone stale)", () => {
    const stale = () => invoice({ status: "CHARGING", attemptCount: 1, lastAttemptAt: new Date(NOW.getTime() - 60 * 60 * 1000) });

    it("does not charge again when Finix shows the interrupted attempt went through", async () => {
      prismaMock.partnerInvoice.findUnique.mockResolvedValue(stale());
      finix.findTransferByIdempotencyId.mockResolvedValue({ id: "TR_done", state: "SUCCEEDED" });
      expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("SUCCEEDED");
      expect(finix.findTransferByIdempotencyId).toHaveBeenCalledWith("partner-invoice:inv1:1");
      expect(finix.createTransfer).not.toHaveBeenCalled();
      expect(prismaMock.partnerInvoice.update.mock.calls[0][0].data).toMatchObject({ status: "SUCCEEDED", finixTransferId: "TR_done" });
    });

    it("waits when the interrupted attempt is still pending at Finix", async () => {
      prismaMock.partnerInvoice.findUnique.mockResolvedValue(stale());
      finix.findTransferByIdempotencyId.mockResolvedValue({ id: "TR_wait", state: "PENDING" });
      expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("PENDING");
      expect(finix.createTransfer).not.toHaveBeenCalled();
    });

    it("tries again, as a new attempt, when Finix never saw the interrupted one", async () => {
      prismaMock.partnerInvoice.findUnique.mockResolvedValue(stale());
      finix.findTransferByIdempotencyId.mockResolvedValue(null);
      expect(await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true })).toBe("SUCCEEDED");
      expect(finix.createTransfer.mock.calls[0][0].idempotency_id).toBe("partner-invoice:inv1:2");
    });

    it("tries again when the interrupted attempt is known to have failed", async () => {
      prismaMock.partnerInvoice.findUnique.mockResolvedValue(stale());
      finix.findTransferByIdempotencyId.mockResolvedValue({ id: "TR_bad", state: "FAILED" });
      await chargePartnerInvoice("inv1", { now: NOW, chargingEnabled: true });
      expect(finix.createTransfer).toHaveBeenCalledTimes(1);
    });
  });
});

describe("runPartnerBilling", () => {
  it("makes invoices but touches no card while charging is off", async () => {
    prismaMock.partner.findMany.mockResolvedValue([{ id: "p1" }]);
    prismaMock.partnerInvoice.findUnique.mockResolvedValue(null);
    prismaMock.partnerBillableApproval.findMany.mockResolvedValue([{ churchId: "c1" }]);
    prismaMock.church.findMany.mockResolvedValue([{ id: "c1", name: "A", partnerReference: null }]);
    prismaMock.partnerInvoice.create.mockResolvedValue(invoice({ id: "inv_new" }));
    prismaMock.partnerInvoice.findMany.mockResolvedValue([{ id: "inv_new" }]);

    const result = await runPartnerBilling({ now: NOW, chargingEnabled: false });
    expect(result).toMatchObject({ period: "2026-11", invoicesMade: 1, charged: 0, chargingEnabled: false });
    expect(finix.createTransfer).not.toHaveBeenCalled();
  });

  it("charges what is due when switched on", async () => {
    prismaMock.partner.findMany.mockResolvedValue([]);
    prismaMock.partnerInvoice.findMany.mockResolvedValue([{ id: "inv1" }]);
    const result = await runPartnerBilling({ now: NOW, chargingEnabled: true });
    expect(result.charged).toBe(1);
    expect(finix.createTransfer).toHaveBeenCalledTimes(1);
  });

  it("only looks at billed, active partners", async () => {
    prismaMock.partner.findMany.mockResolvedValue([]);
    prismaMock.partnerInvoice.findMany.mockResolvedValue([]);
    await runPartnerBilling({ now: NOW, chargingEnabled: true });
    expect(prismaMock.partner.findMany.mock.calls[0][0].where).toEqual({ status: "ACTIVE", pricePerMerchantCents: { gt: 0 } });
  });
});
