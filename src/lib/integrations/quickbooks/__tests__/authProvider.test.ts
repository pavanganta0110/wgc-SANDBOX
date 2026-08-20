import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config", () => ({
  QUICKBOOKS_TOKEN_URL: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  getQuickBooksOAuthConfig: vi.fn(() => ({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://example.com/callback",
    environment: "sandbox",
    scopes: "com.intuit.quickbooks.accounting",
  })),
}));

async function load() {
  vi.resetModules();
  return import("../authProvider");
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("refreshAccessToken", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("parses a successful Intuit token response into a QuickBooksTokenSet", async () => {
    (global.fetch as any).mockResolvedValue(
      jsonResponse({ access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer", expires_in: 3600, x_refresh_token_expires_in: 8640000 })
    );
    const { refreshAccessToken } = await load();
    const result = await refreshAccessToken("old-refresh-token");
    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("new-refresh");
    expect(result.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws QuickBooksAuthError on a non-2xx response", async () => {
    (global.fetch as any).mockResolvedValue(jsonResponse({ error: "invalid_grant" }, false, 400));
    const { refreshAccessToken, QuickBooksAuthError } = await load();
    await expect(refreshAccessToken("stale-refresh-token")).rejects.toThrow(QuickBooksAuthError);
  });

  it("throws QuickBooksAuthError when fetch itself rejects (network failure)", async () => {
    (global.fetch as any).mockRejectedValue(new Error("network down"));
    const { refreshAccessToken, QuickBooksAuthError } = await load();
    await expect(refreshAccessToken("refresh-token")).rejects.toThrow(QuickBooksAuthError);
  });
});

describe("OAuthQuickBooksAuthProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the stored access token without a network call when it is not yet near expiry", async () => {
    const { OAuthQuickBooksAuthProvider } = await load();
    const resolveCredentials = vi.fn().mockResolvedValue({
      realmId: "realm-1",
      accessToken: "still-valid-token",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
    });
    const persistRefreshed = vi.fn();
    const provider = new OAuthQuickBooksAuthProvider(resolveCredentials, persistRefreshed);

    const result = await provider.getAccessToken("church-1");
    expect(result.token).toBe("still-valid-token");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(persistRefreshed).not.toHaveBeenCalled();
  });

  it("refreshes and persists a new token pair when the stored token is expired", async () => {
    (global.fetch as any).mockResolvedValue(
      jsonResponse({ access_token: "rotated-access", refresh_token: "rotated-refresh", token_type: "bearer", expires_in: 3600 })
    );
    const { OAuthQuickBooksAuthProvider } = await load();
    const resolveCredentials = vi.fn().mockResolvedValue({
      realmId: "realm-1",
      accessToken: "expired-token",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: new Date(Date.now() - 1000),
    });
    const persistRefreshed = vi.fn().mockResolvedValue(undefined);
    const provider = new OAuthQuickBooksAuthProvider(resolveCredentials, persistRefreshed);

    const result = await provider.getAccessToken("church-1");
    expect(result.token).toBe("rotated-access");
    expect(persistRefreshed).toHaveBeenCalledWith("church-1", expect.objectContaining({ accessToken: "rotated-access", refreshToken: "rotated-refresh" }));
  });

  it("never issues two concurrent refresh requests for the same church (single-flight)", async () => {
    let resolveFetch!: (value: Response) => void;
    (global.fetch as any).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const { OAuthQuickBooksAuthProvider } = await load();
    const resolveCredentials = vi.fn().mockResolvedValue({
      realmId: "realm-1",
      accessToken: "expired-token",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: new Date(Date.now() - 1000),
    });
    const persistRefreshed = vi.fn().mockResolvedValue(undefined);
    const provider = new OAuthQuickBooksAuthProvider(resolveCredentials, persistRefreshed);

    const p1 = provider.getAccessToken("church-1");
    const p2 = provider.getAccessToken("church-1");

    resolveFetch(jsonResponse({ access_token: "a", refresh_token: "b", token_type: "bearer", expires_in: 3600 }));
    await Promise.all([p1, p2]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("clears the cache on invalidate() so the next call fetches fresh credentials", async () => {
    const { OAuthQuickBooksAuthProvider } = await load();
    const resolveCredentials = vi.fn().mockResolvedValue({
      realmId: "realm-1",
      accessToken: "token-a",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
    });
    const provider = new OAuthQuickBooksAuthProvider(resolveCredentials, vi.fn());

    await provider.getAccessToken("church-1");
    provider.invalidate("church-1");
    await provider.getAccessToken("church-1");

    expect(resolveCredentials).toHaveBeenCalledTimes(2);
  });
});
