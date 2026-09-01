import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

async function load() {
  vi.resetModules();
  return import("../config");
}

describe("getQuickBooksEndpoints — OAuth discovery document", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves endpoints from Intuit's real discovery document shape", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://appcenter.intuit.com/connect/oauth2",
        token_endpoint: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        revocation_endpoint: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
        userinfo_endpoint: "https://accounts.platform.intuit.com/v1/openid_connect/userinfo",
      }),
    });

    const { getQuickBooksEndpoints } = await load();
    const endpoints = await getQuickBooksEndpoints();

    expect(endpoints).toEqual({
      authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      revokeUrl: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
      userinfoUrl: "https://accounts.platform.intuit.com/v1/openid_connect/userinfo",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://developer.api.intuit.com/.well-known/openid_configuration",
      expect.anything()
    );
  });

  it("caches the result — a second call within the TTL doesn't fetch again", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://appcenter.intuit.com/connect/oauth2",
        token_endpoint: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      }),
    });

    const { getQuickBooksEndpoints } = await load();
    await getQuickBooksEndpoints();
    await getQuickBooksEndpoints();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the hardcoded endpoints, never throws, when the fetch fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const { getQuickBooksEndpoints } = await load();
    const endpoints = await getQuickBooksEndpoints();

    expect(endpoints.authorizeUrl).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(endpoints.tokenUrl).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
  });

  it("falls back when the response is missing required endpoints, rather than resolving a broken URL", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ authorization_endpoint: "https://appcenter.intuit.com/connect/oauth2" /* no token_endpoint */ }),
    });

    const { getQuickBooksEndpoints } = await load();
    const endpoints = await getQuickBooksEndpoints();

    expect(endpoints.tokenUrl).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
  });

  it("falls back when the HTTP response itself is not ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const { getQuickBooksEndpoints } = await load();
    const endpoints = await getQuickBooksEndpoints();

    expect(endpoints.authorizeUrl).toBe("https://appcenter.intuit.com/connect/oauth2");
  });
});
