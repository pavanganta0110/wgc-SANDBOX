import { describe, it, expect } from "vitest";
import { buildReminderIdempotencyKey } from "../invoiceReminders";

describe("buildReminderIdempotencyKey", () => {
  it("buckets by invoice, type, and calendar day (not exact time)", () => {
    const a = buildReminderIdempotencyKey("inv_1", "BEFORE_DUE", new Date("2026-08-10T02:00:00Z"));
    const b = buildReminderIdempotencyKey("inv_1", "BEFORE_DUE", new Date("2026-08-10T23:00:00Z"));
    expect(a).toBe(b);
  });

  it("differs by reminder type for the same invoice and day", () => {
    const beforeDue = buildReminderIdempotencyKey("inv_1", "BEFORE_DUE", new Date("2026-08-10T00:00:00Z"));
    const onDue = buildReminderIdempotencyKey("inv_1", "ON_DUE", new Date("2026-08-10T00:00:00Z"));
    expect(beforeDue).not.toBe(onDue);
  });

  it("differs by invoice for the same type and day", () => {
    const a = buildReminderIdempotencyKey("inv_1", "AFTER_DUE", new Date("2026-08-10T00:00:00Z"));
    const b = buildReminderIdempotencyKey("inv_2", "AFTER_DUE", new Date("2026-08-10T00:00:00Z"));
    expect(a).not.toBe(b);
  });
});
