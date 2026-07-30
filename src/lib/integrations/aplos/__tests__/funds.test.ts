import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listFunds } from "../funds";

describe("listFunds", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("returns validated funds", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        version: "v2_0_0",
        status: 200,
        data: { funds: [{ id: 1, name: "General Fund", balance_account_name: "General Fund Balance", balance_account_number: 3000 }] },
        links: {},
      }),
    });
    const result = await listFunds("tok", "org");
    expect(result).toEqual([{ id: 1, name: "General Fund", balance_account_name: "General Fund Balance", balance_account_number: 3000 }]);
  });

  it("skips malformed items", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_0", status: 200, data: { funds: [{ notAFund: true }] }, links: {} }),
    });
    const result = await listFunds("tok", "org");
    expect(result).toEqual([]);
  });
});
