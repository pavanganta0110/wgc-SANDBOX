import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postAplosContribution, AplosContributionPostError } from "../contributionsClient";
import type { AplosContributionInput } from "../types";

const PAYLOAD: AplosContributionInput = {
  name: "WGC settlement stl_1 — 2026-01-15",
  date: "2026-01-15",
  deposit_account: { account_number: 1000 },
  expense_account: { account_number: 6000 },
  lines: [{ contact: { firstname: "Jane", lastname: "Smith", type: "individual" }, purpose: { id: 42 }, amount: 100, expense_amount: 4.2 }],
};

describe("postAplosContribution", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the created contribution on a confirmed 200 response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_0", status: 200, data: { id: 999, name: PAYLOAD.name, date: PAYLOAD.date, lines: [], created: "2026-01-15T00:00:00Z", amount: 100 } }),
    });
    const result = await postAplosContribution(PAYLOAD, "token", "acct_1");
    expect(result.id).toBe(999);
  });

  it("sends the Authorization and aplos-account-id headers with a JSON body", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_0", status: 200, data: { id: 1, name: "x", date: "2026-01-15", lines: [], created: "2026-01-15T00:00:00Z", amount: 100 } }),
    });
    await postAplosContribution(PAYLOAD, "secret-token", "acct_1");
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(init.headers["aplos-account-id"]).toBe("acct_1");
    expect(JSON.parse(init.body)).toEqual(PAYLOAD);
  });

  it("classifies a confirmed Aplos exception response as non-ambiguous", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ version: "v2_0_0", status: 422, exception: { message: "Lines Out of Balance", code: 4005 } }),
    });
    await expect(postAplosContribution(PAYLOAD, "token", "acct_1")).rejects.toMatchObject({
      ambiguous: false,
      normalized: { category: "RECONCILIATION_ERROR" },
    });
  });

  it("treats a network error after the request was sent as ambiguous", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("fetch failed"));
    await expect(postAplosContribution(PAYLOAD, "token", "acct_1")).rejects.toMatchObject({ ambiguous: true });
  });

  it("treats a timeout (AbortError) after the request was sent as ambiguous", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);
    await expect(postAplosContribution(PAYLOAD, "token", "acct_1")).rejects.toMatchObject({ ambiguous: true, normalized: { category: "AMBIGUOUS_RESULT" } });
  });

  it("treats an unparseable response body as ambiguous even though a real HTTP response came back", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    });
    await expect(postAplosContribution(PAYLOAD, "token", "acct_1")).rejects.toMatchObject({ ambiguous: true });
  });

  it("throws AplosContributionPostError as a real instance (never a plain object)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("fetch failed"));
    try {
      await postAplosContribution(PAYLOAD, "token", "acct_1");
      throw new Error("expected postAplosContribution to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(AplosContributionPostError);
    }
  });
});
