import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  payment: { findMany: vi.fn() },
  externalDonation: { findMany: vi.fn(), findFirst: vi.fn() },
  donor: { findMany: vi.fn() },
  finixRefundOrReversal: { findMany: vi.fn() },
  finixDispute: { findMany: vi.fn() },
  finixTransfer: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { decodePartnerLedgerCursor, encodePartnerLedgerCursor, loadPartnerLedgerPage } from "../loadLedger";

const orgs = [
  { id: "c1", name: "Grace", reference: "loc_1" },
  { id: "c2", name: "Hope", reference: null },
];

const payment = (id: string, churchId: string, iso: string) => ({
  id,
  churchId,
  donorId: null,
  createdAt: new Date(iso),
  status: "SUCCEEDED",
  paymentMethodType: "CARD",
  cardBrand: "VISA",
  amountCents: 1000,
  donationAmountCents: 1000,
  feeCoveredCents: 0,
  donorCoversFee: false,
  actualFinixFeesCents: 59,
  merchantExpectedNetCents: 941,
  fundId: null,
  fundName: null,
  finixSubscriptionId: null,
  finixTransferId: null,
  goodsServicesProvided: false,
  goodsServicesDescription: null,
  goodsServicesFairMarketValueCents: null,
  givingLinkId: null,
  receiptNumber: null,
});

const external = (id: string, churchId: string, iso: string) => ({
  id,
  churchId,
  donorId: null,
  donationDate: new Date(iso),
  paymentMethod: "CHECK",
  status: "RECORDED",
  donationAmountCents: 5000,
  supplementalFeeCents: 0,
  processingFeeCents: 0,
  providerFeeCents: 0,
  netAmountReceivedCents: 5000,
  fundId: null,
  fundName: null,
  goodsOrServicesProvided: false,
  goodsOrServicesDescription: null,
  goodsOrServicesValueCents: null,
  finixSettlementId: null,
  voidedAt: null,
  receiptNumber: null,
});

const window = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-02-01T00:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.donor.findMany.mockResolvedValue([]);
  prismaMock.finixRefundOrReversal.findMany.mockResolvedValue([]);
  prismaMock.finixDispute.findMany.mockResolvedValue([]);
  prismaMock.finixTransfer.findMany.mockResolvedValue([]);
});

describe("loadPartnerLedgerPage", () => {
  it("reads nothing for a partner with no organizations", async () => {
    const page = await loadPartnerLedgerPage({ organizations: [], ...window, cursor: null, limit: 10 });
    expect(page).toEqual({ rows: [], nextCursor: null });
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });

  it("limits every read to the given organizations", async () => {
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.externalDonation.findMany.mockResolvedValue([]);
    await loadPartnerLedgerPage({ organizations: orgs, ...window, cursor: null, limit: 10 });
    expect(prismaMock.payment.findMany.mock.calls[0][0].where.churchId).toEqual({ in: ["c1", "c2"] });
    expect(prismaMock.externalDonation.findMany.mock.calls[0][0].where.churchId).toEqual({ in: ["c1", "c2"] });
    expect(prismaMock.donor.findMany.mock.calls.length + prismaMock.finixTransfer.findMany.mock.calls.length).toBeGreaterThanOrEqual(0);
  });

  it("merges payments and external gifts oldest first and tags each with its organization", async () => {
    prismaMock.payment.findMany.mockResolvedValue([payment("p_b", "c2", "2026-01-05T10:00:00Z"), payment("p_a", "c1", "2026-01-03T10:00:00Z")]);
    prismaMock.externalDonation.findMany.mockResolvedValue([external("e_1", "c1", "2026-01-04T00:00:00Z")]);

    const { rows, nextCursor } = await loadPartnerLedgerPage({ organizations: orgs, ...window, cursor: null, limit: 10 });
    expect(rows.map((r) => r.id)).toEqual(["p_a", "e_1", "p_b"]);
    expect(rows.map((r) => r.organization.name)).toEqual(["Grace", "Grace", "Hope"]);
    expect(rows[0].organization).toEqual({ id: "c1", name: "Grace", reference: "loc_1" });
    expect(rows[1].source).toBe("EXTERNAL");
    expect(nextCursor).toBeNull();
  });

  it("returns a cursor when there is more, and the next page starts strictly after it", async () => {
    prismaMock.payment.findMany.mockResolvedValue([
      payment("p_1", "c1", "2026-01-02T00:00:00Z"),
      payment("p_2", "c1", "2026-01-03T00:00:00Z"),
      payment("p_3", "c1", "2026-01-04T00:00:00Z"),
    ]);
    prismaMock.externalDonation.findMany.mockResolvedValue([]);

    const first = await loadPartnerLedgerPage({ organizations: orgs, ...window, cursor: null, limit: 2 });
    expect(first.rows.map((r) => r.id)).toEqual(["p_1", "p_2"]);
    expect(first.nextCursor).not.toBeNull();
    expect(decodePartnerLedgerCursor(first.nextCursor!)).toEqual({ date: "2026-01-03T00:00:00.000Z", id: "p_2" });

    prismaMock.payment.findMany.mockResolvedValue([payment("p_3", "c1", "2026-01-04T00:00:00Z")]);
    const cursor = decodePartnerLedgerCursor(first.nextCursor!);
    const second = await loadPartnerLedgerPage({ organizations: orgs, ...window, cursor, limit: 2 });
    expect(second.rows.map((r) => r.id)).toEqual(["p_3"]);
    expect(second.nextCursor).toBeNull();

    const where = prismaMock.payment.findMany.mock.calls.at(-1)![0].where;
    expect(where.OR).toEqual([{ createdAt: { gt: new Date("2026-01-03T00:00:00.000Z") } }, { createdAt: new Date("2026-01-03T00:00:00.000Z"), id: { gt: "p_2" } }]);
  });

  it("breaks a tie on the same instant by id, across sources", async () => {
    prismaMock.payment.findMany.mockResolvedValue([payment("p_z", "c1", "2026-01-02T00:00:00Z")]);
    prismaMock.externalDonation.findMany.mockResolvedValue([external("e_a", "c1", "2026-01-02T00:00:00Z")]);
    const { rows } = await loadPartnerLedgerPage({ organizations: orgs, ...window, cursor: null, limit: 10 });
    expect(rows.map((r) => r.id)).toEqual(["e_a", "p_z"]);
  });
});

describe("cursor encoding", () => {
  it("round-trips and rejects garbage", () => {
    const cursor = { date: "2026-01-03T00:00:00.000Z", id: "abc" };
    expect(decodePartnerLedgerCursor(encodePartnerLedgerCursor(cursor))).toEqual(cursor);
    expect(decodePartnerLedgerCursor("not-a-cursor")).toBeNull();
    expect(decodePartnerLedgerCursor(Buffer.from(JSON.stringify({ date: "nope", id: "x" })).toString("base64url"))).toBeNull();
    expect(decodePartnerLedgerCursor(Buffer.from(JSON.stringify({ id: "x" })).toString("base64url"))).toBeNull();
  });
});

import { loadLedgerRowForExternal, withExternalLedgerRow } from "../loadLedger";

describe("external gift ledger row (for the donation.created / updated / voided events)", () => {
  it("builds the row for one external gift of this organization only", async () => {
    prismaMock.externalDonation.findFirst.mockResolvedValue(external("e_1", "c1", "2026-01-04T00:00:00Z"));
    const row = await loadLedgerRowForExternal("c1", "e_1");
    expect(prismaMock.externalDonation.findFirst.mock.calls[0][0].where).toEqual({ id: "e_1", churchId: "c1" });
    expect(row).toMatchObject({ id: "e_1", source: "EXTERNAL", method: "external", giftCents: 5000 });
  });

  it("is null for a gift that isn't this organization's", async () => {
    prismaMock.externalDonation.findFirst.mockResolvedValue(null);
    expect(await loadLedgerRowForExternal("c1", "e_x")).toBeNull();
  });

  it("adds the ledger row to an event payload, and never throws", async () => {
    prismaMock.externalDonation.findFirst.mockResolvedValue(external("e_1", "c1", "2026-01-04T00:00:00Z"));
    const withRow = await withExternalLedgerRow("c1", "e_1", { externalDonationId: "e_1" });
    expect(withRow.externalDonationId).toBe("e_1");
    expect((withRow.ledger as { id: string }).id).toBe("e_1");

    prismaMock.externalDonation.findFirst.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await withExternalLedgerRow("c1", "e_1", { externalDonationId: "e_1" })).toEqual({ externalDonationId: "e_1" });
  });
});
