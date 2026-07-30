import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { aplosAuthenticatedGet, AplosResourceError } from "../resourceClient";

describe("aplosAuthenticatedGet", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("sends the Bearer token and aplos-account-id header exactly as documented", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ version: "v2_0_0", status: 200, data: {} }) });

    await aplosAuthenticatedGet("/purposes", "my-token", "org-1", { f_enabled: "y" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.aplos.com/hermes/api/v1/purposes?f_enabled=y");
    expect(init.headers).toMatchObject({ Authorization: "Bearer my-token", "aplos-account-id": "org-1" });
  });

  it("omits the aplos-account-id header when not provided", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ version: "v2_0_0", status: 200, data: {} }) });
    await aplosAuthenticatedGet("/accounts", "tok", undefined);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("aplos-account-id");
  });

  it("throws AplosResourceError on a documented exception response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ version: "v2_0_0", status: 401, exception: { message: "Token expired.", code: 1004 } }),
    });
    await expect(aplosAuthenticatedGet("/purposes", "tok", "org")).rejects.toBeInstanceOf(AplosResourceError);
  });

  it("throws on network failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(aplosAuthenticatedGet("/purposes", "tok", "org")).rejects.toBeInstanceOf(AplosResourceError);
  });

  it("throws on a malformed (non-JSON) response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    });
    await expect(aplosAuthenticatedGet("/purposes", "tok", "org")).rejects.toBeInstanceOf(AplosResourceError);
  });

  it("never includes falsy/empty search params in the URL", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ version: "v2_0_0", status: 200, data: {} }) });
    await aplosAuthenticatedGet("/accounts", "tok", "org", { f_name: "" });
    expect(fetchMock.mock.calls[0][0]).not.toContain("f_name");
  });
});
