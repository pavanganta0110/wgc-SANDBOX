import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

vi.mock("../config", async () => {
  const actual = await vi.importActual<typeof import("../config")>("../config");
  return {
    ...actual,
    getPlanningCenterOAuthConfig: vi.fn(() => ({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://example.com/callback",
      scopes: "giving people",
    })),
  };
});

async function load() {
  vi.resetModules();
  return import("../authProvider");
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, headers: new Headers() } as Response;
}

describe("PKCE and authorize URL", () => {
  it("derives the challenge as base64url(sha256(verifier))", async () => {
    const { generatePkcePair } = await load();
    const { codeVerifier, codeChallenge } = generatePkcePair();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge).toBe(crypto.createHash("sha256").update(codeVerifier).digest("base64url"));
  });

  it("generates distinct state values", async () => {
    const { generateOAuthState } = await load();
    expect(generateOAuthState()).not.toBe(generateOAuthState());
  });

  it("builds an authorize URL with scopes, state and S256 challenge", async () => {
    const { buildAuthorizeUrl } = await load();
    const url = new URL(buildAuthorizeUrl({ state: "st", codeChallenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://api.planningcenteronline.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("giving people");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_secret")).toBeNull();
  });
});

describe("token endpoint", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("exchanges a code with the PKCE verifier and computes lifetimes from created_at", async () => {
    const createdAt = Math.floor(Date.now() / 1000);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ access_token: "a", refresh_token: "r", expires_in: 7200, created_at: createdAt, scope: "giving people" })
    );
    const { exchangeAuthorizationCode } = await load();
    const tokens = await exchangeAuthorizationCode("the-code", "the-verifier");

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.planningcenteronline.com/oauth/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(init.headers["User-Agent"]).toBeTruthy();

    expect(tokens.accessToken).toBe("a");
    expect(tokens.accessTokenExpiresAt.getTime()).toBe((createdAt + 7200) * 1000);
    expect(tokens.refreshTokenExpiresAt.getTime()).toBe((createdAt + 90 * 24 * 3600) * 1000);
    expect(tokens.scopes).toBe("giving people");
  });

  it("returns the rotated refresh token on refresh", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ access_token: "a2", refresh_token: "r2", expires_in: 7200 }));
    const { refreshAccessToken } = await load();
    const tokens = await refreshAccessToken("r1");
    expect(tokens.refreshToken).toBe("r2");
    const body = new URLSearchParams(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("r1");
  });

  it("classifies invalid_grant", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ error: "invalid_grant", error_description: "revoked" }, 400));
    const { refreshAccessToken } = await load();
    await expect(refreshAccessToken("dead")).rejects.toMatchObject({ normalized: { category: "INVALID_GRANT", retryable: false } });
  });

  it("rejects a response missing the refresh token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ access_token: "a" }));
    const { refreshAccessToken } = await load();
    await expect(refreshAccessToken("r")).rejects.toThrow(/missing an access or refresh token/);
  });

  it("maps a network failure to a retryable temporary error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const { refreshAccessToken } = await load();
    await expect(refreshAccessToken("r")).rejects.toMatchObject({ normalized: { category: "TEMPORARY_PLANNING_CENTER_ERROR", retryable: true } });
  });

  it("revokeToken swallows failures so disconnect can't be blocked", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const { revokeToken } = await load();
    await expect(revokeToken("t", "refresh_token")).resolves.toBe(false);
  });
});
