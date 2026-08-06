import { describe, it, expect } from "vitest";
import { hasNextPage, parseNextPageNum } from "../pagination";

describe("hasNextPage", () => {
  it("is true when links.next is present", () => {
    expect(hasNextPage({ next: "/api/v1/purposes?page_size=1&page_num=2" })).toBe(true);
  });
  it("is false when links.next is absent (documented end-of-results signal)", () => {
    expect(hasNextPage({ self: "/api/v1/purposes?page_size=1&page_num=1" })).toBe(false);
    expect(hasNextPage(undefined)).toBe(false);
  });
});

describe("parseNextPageNum", () => {
  it("extracts page_num from a documented relative next link", () => {
    expect(parseNextPageNum("/api/v1/purposes?page_size=100&page_num=3")).toBe(3);
  });
  it("returns null for a link with no page_num", () => {
    expect(parseNextPageNum("/api/v1/purposes?page_size=100")).toBeNull();
  });
  it("returns null for a malformed link rather than throwing", () => {
    expect(parseNextPageNum("::not a url::")).toBeNull();
  });
});
