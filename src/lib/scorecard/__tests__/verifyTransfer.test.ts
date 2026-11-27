import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ givingLink: { findUnique: vi.fn() }, church: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const finix = vi.hoisted(() => ({ getTransfer: vi.fn() }));
vi.mock("@/lib/finix/client", () => ({ finixClient: finix }));

import { verifyTransfer } from "../verifyTransfer";

const notBefore = new Date("2026-11-27T10:00:00Z");
const good = { id: "TRabcdefghij1", state: "SUCCEEDED", type: "DEBIT", amount: 10000, merchant: "MU123", created_at: "2026-11-27T11:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SCORECARD_REPORT_PRICE_CENTS;
  prismaMock.givingLink.findUnique.mockResolvedValue({ churchId: "c1" });
  prismaMock.church.findUnique.mockResolvedValue({ finixMerchantId: "MU123" });
  finix.getTransfer.mockResolvedValue(good);
});

describe("verifyTransfer", () => {
  it("accepts a succeeded debit of the full price to the scorecard's own merchant, made after the buyer arrived", async () => {
    expect(await verifyTransfer("TRabcdefghij1", notBefore)).toMatchObject({ ok: true });
    expect(prismaMock.givingLink.findUnique.mock.calls[0][0].where).toEqual({ publicSlug: "IPHa4RsF8WlK" });
  });

  it.each([
    ["no id", "", "no_transfer_id"],
    ["a malformed id", "not-a-transfer", "no_transfer_id"],
  ])("refuses %s", async (_n, id, reason) => {
    expect(await verifyTransfer(id, notBefore)).toEqual({ ok: false, reason });
    expect(finix.getTransfer).not.toHaveBeenCalled();
  });

  it("refuses a payment that is pending, not a debit, too small, to another merchant, or too old", async () => {
    const cases: Array<[Partial<typeof good>, string]> = [
      [{ state: "PENDING" }, "state_PENDING"],
      [{ type: "CREDIT" }, "type_CREDIT"],
      [{ amount: 9999 }, "amount_9999"],
      [{ merchant: "MU999" }, "wrong_merchant"],
      [{ created_at: "2026-11-01T00:00:00Z" }, "transfer_too_old"],
      [{ created_at: undefined }, "transfer_too_old"],
    ];
    for (const [over, reason] of cases) {
      finix.getTransfer.mockResolvedValue({ ...good, ...over });
      expect(await verifyTransfer("TRabcdefghij1", notBefore)).toEqual({ ok: false, reason });
    }
  });

  it("never skips the merchant check: no merchant on the scorecard's organization means no report", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ finixMerchantId: null });
    expect(await verifyTransfer("TRabcdefghij1", notBefore)).toEqual({ ok: false, reason: "merchant_not_found" });
    prismaMock.givingLink.findUnique.mockResolvedValue(null);
    expect(await verifyTransfer("TRabcdefghij1", notBefore)).toEqual({ ok: false, reason: "merchant_not_found" });
  });

  it("tells a missing transfer from an unreachable Finix", async () => {
    finix.getTransfer.mockRejectedValue(Object.assign(new Error("nf"), { status: 404 }));
    expect(await verifyTransfer("TRabcdefghij1", notBefore)).toEqual({ ok: false, reason: "transfer_not_found" });
    finix.getTransfer.mockRejectedValue(new Error("boom"));
    expect(await verifyTransfer("TRabcdefghij1", notBefore)).toEqual({ ok: false, reason: "finix_unreachable" });
  });
});
