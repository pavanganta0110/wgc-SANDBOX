import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listPurposes } from "../purposes";

function envelope(purposes: unknown[], next?: string) {
  return { ok: true, status: 200, json: async () => ({ version: "v2_0_0", status: 200, data: { purposes }, links: next ? { next } : {} }) };
}

const realPurpose = { id: 1, name: "General", is_enabled: true, fund: { id: 1, name: "General Fund" } };

describe("listPurposes", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("returns validated purposes from a single page", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(envelope([realPurpose]));
    const result = await listPurposes("tok", "org");
    expect(result).toEqual([realPurpose]);
  });

  it("follows links.next across multiple pages", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(envelope([{ ...realPurpose, id: 1 }], "/api/v1/purposes?page_size=1&page_num=2"))
      .mockResolvedValueOnce(envelope([{ ...realPurpose, id: 2 }]));

    const result = await listPurposes("tok", "org");
    expect(result.map((p) => p.id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips a malformed item instead of failing the whole list", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(envelope([realPurpose, { garbage: true }]));
    const result = await listPurposes("tok", "org");
    expect(result).toEqual([realPurpose]);
  });

  it("filters to enabled purposes by default (f_enabled=y)", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(envelope([]));
    await listPurposes("tok", "org");
    expect(fetchMock.mock.calls[0][0]).toContain("f_enabled=y");
  });

  it("does not loop forever on a non-advancing next link", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(envelope([realPurpose], "/api/v1/purposes?page_size=1&page_num=1"));
    const result = await listPurposes("tok", "org");
    expect(result).toEqual([realPurpose]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
