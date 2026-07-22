import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// No component-rendering test harness (jsdom/testing-library) exists in
// this codebase yet — every other test here is logic-level. This asserts
// against the component's source directly, which is enough to guard the
// two structural requirements: Save View is fully gone (not just hidden),
// and the Fund / Designation filter is present alongside the pre-existing
// filters (Date range/State/Last Four/Donor Name).
const source = readFileSync(join(__dirname, "../PaymentsFilterBar.tsx"), "utf-8");

describe("PaymentsFilterBar — Save View removal and Fund / Designation filter", () => {
  it("no longer renders a Save View button or its handler", () => {
    expect(source).not.toContain("Save View");
    expect(source).not.toContain("Saved views are coming soon");
    expect(source).not.toContain("Bookmark");
  });

  it("renders a Fund / Designation filter alongside the existing filters", () => {
    expect(source).toContain("Fund / Designation");
    expect(source).toContain('onApply={(v) => setParam("fund", v)}');
  });

  it("existing filters (State, Last Four, Donor Name, Date range) are still present", () => {
    expect(source).toContain("DateRangePicker");
    expect(source).toContain("Last Four");
    expect(source).toContain("Donor Name");
    expect(source).toContain('setParam("state"');
  });

  it("CSV/PDF export links still forward the full current query string (including fund)", () => {
    expect(source).toContain("searchParams.toString()");
  });

  it("no longer renders the non-functional 'Filters' placeholder button", () => {
    expect(source).not.toContain("More filters are coming soon");
    expect(source).not.toContain("ListFilter");
    expect(source).not.toMatch(/>\s*Filters\s*</);
  });
});
