import { describe, it, expect } from "vitest";
import { parseCreatedDateRange, parseSearchField } from "../merchantFilters";

describe("parseCreatedDateRange", () => {
  it("returns no bounds when nothing is given", () => {
    expect(parseCreatedDateRange(null, null)).toEqual({ start: null, endExclusive: null, error: null });
  });

  it("treats a date-only end as the whole of that day (exclusive bound is the next midnight)", () => {
    const r = parseCreatedDateRange("2026-10-01", "2026-10-08");
    expect(r.error).toBeNull();
    expect(r.start?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.endExclusive?.toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("includes the end day when start and end are the same day", () => {
    const r = parseCreatedDateRange("2026-10-08", "2026-10-08");
    expect(r.error).toBeNull();
    expect(r.endExclusive?.toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("supports only a start or only an end", () => {
    expect(parseCreatedDateRange("2026-10-01", null).endExclusive).toBeNull();
    expect(parseCreatedDateRange(null, "2026-10-08").start).toBeNull();
  });

  it("keeps a full timestamp end inclusive without shifting a day", () => {
    const r = parseCreatedDateRange(null, "2026-10-08T12:00:00.000Z");
    expect(r.endExclusive?.toISOString()).toBe("2026-10-08T12:00:00.001Z");
  });

  it("rejects garbage and reversed ranges instead of throwing", () => {
    expect(parseCreatedDateRange("not-a-date", null).error).toMatch(/Invalid/);
    expect(parseCreatedDateRange("2026-10-09", "2026-10-01").error).toMatch(/before/);
  });
});

describe("parseSearchField", () => {
  it("only 'name' narrows the search; everything else keeps the broad search", () => {
    expect(parseSearchField("name")).toBe("name");
    expect(parseSearchField("any")).toBe("any");
    expect(parseSearchField(null)).toBe("any");
    expect(parseSearchField("email; DROP TABLE")).toBe("any");
  });
});
