import { describe, it, expect } from "vitest";
import { generateRequestId, getOrCreateRequestId } from "../requestId";

describe("generateRequestId", () => {
  it("produces a req_-prefixed id", () => {
    expect(generateRequestId()).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it("produces a different id on every call", () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a).not.toBe(b);
  });
});

describe("getOrCreateRequestId", () => {
  it("returns the inbound x-request-id header when present", () => {
    const headers = new Headers({ "x-request-id": "req_from_caller" });
    expect(getOrCreateRequestId(headers)).toBe("req_from_caller");
  });

  it("mints a fresh id when no header is present", () => {
    const headers = new Headers();
    expect(getOrCreateRequestId(headers)).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it("mints a fresh id when headers is undefined", () => {
    expect(getOrCreateRequestId(undefined)).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it("mints a fresh id when headers is null", () => {
    expect(getOrCreateRequestId(null)).toMatch(/^req_[0-9a-f]{32}$/);
  });
});
