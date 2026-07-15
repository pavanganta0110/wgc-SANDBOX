import { describe, it, expect } from "vitest";
import { toSettlementFieldsForCreate, toSettlementFieldsForUpdate } from "@/lib/finix/sync/syncSettlements";

describe("toSettlementFieldsForCreate", () => {
  it("falls back to null for missing fields — there's nothing to preserve on a brand-new row", () => {
    const fields = toSettlementFieldsForCreate({ status: "SETTLED" });

    expect(fields.state).toBe("SETTLED");
    expect(fields.processorState).toBe("SETTLED");
    expect(fields.totalAmountCents).toBeNull();
    expect(fields.netAmountCents).toBeNull();
    expect(fields.feeAmountCents).toBeNull();
    expect(fields.traceId).toBeNull();
  });
});

describe("toSettlementFieldsForUpdate — partial-payload null preservation", () => {
  it("omits (does not null out) fields missing from a partial webhook payload", () => {
    // A partial payload with only `status` — the kind of thing a later,
    // incomplete webhook delivery might send after an earlier sync already
    // populated the full amount fields.
    const partialPayload = { status: "SETTLED" };
    const fields = toSettlementFieldsForUpdate(partialPayload);

    expect(fields.state).toBe("SETTLED");
    expect(fields.processorState).toBe("SETTLED");
    // Prisma treats `undefined` as "don't touch this column" — anything
    // other than `undefined` here would risk nulling out a previously
    // synced value when Prisma applies this object as `update.data`.
    expect(fields.totalAmountCents).toBeUndefined();
    expect(fields.netAmountCents).toBeUndefined();
    expect(fields.feeAmountCents).toBeUndefined();
    expect(fields.traceId).toBeUndefined();
    expect(fields.currency).toBeUndefined();
    expect(fields.accruedAt).toBeUndefined();
    expect(fields.settledAt).toBeUndefined();
  });

  it("still applies every field present on a full payload", () => {
    const fullPayload = {
      status: "SETTLED",
      total_amount: 10000,
      net_amount: 9200,
      total_fee: 300,
      trace_id: "TRACE-1",
      currency: "USD",
      window_start_time: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };
    const fields = toSettlementFieldsForUpdate(fullPayload);

    expect(fields.totalAmountCents).toBe(10000);
    expect(fields.netAmountCents).toBe(9200);
    expect(fields.feeAmountCents).toBe(300);
    expect(fields.traceId).toBe("TRACE-1");
    expect(fields.currency).toBe("USD");
    expect(fields.accruedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("falls back total_fees to total_fee when only one is present, without nulling the other", () => {
    const fields = toSettlementFieldsForUpdate({ status: "SETTLED", total_fees: 450 });
    expect(fields.feeAmountCents).toBe(450);
  });

  it("does not mark settledAt when status isn't SETTLED, even if updated_at is present", () => {
    const fields = toSettlementFieldsForUpdate({ status: "PENDING", updated_at: "2026-01-02T00:00:00Z" });
    expect(fields.settledAt).toBeUndefined();
  });
});
