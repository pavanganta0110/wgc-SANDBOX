import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { value: cookieJar.get(k)! } : undefined),
    set: (k: string, v: string) => void cookieJar.set(k, v),
    delete: (k: string) => void cookieJar.delete(k),
  }),
}));

const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockRequireSession() }));
const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: unknown[]) => mockRequirePermission(...a) }));

const mockComplete = vi.fn();
vi.mock("@/lib/integrations/planningcenter/service", () => ({ completePlanningCenterConnection: (...a: unknown[]) => mockComplete(...a) }));

vi.mock("@/lib/integrations/planningcenter/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/planningcenter/config")>("@/lib/integrations/planningcenter/config");
  return {
    ...actual,
    isPlanningCenterIntegrationEnabled: () => true,
    isPlanningCenterIntegrationConfigured: () => true,
    getPlanningCenterOAuthConfig: () => ({ clientId: "cid", clientSecret: "sec", redirectUri: "https://wgc.test/cb", scopes: "giving people" }),
  };
});

import { ForbiddenError } from "@/lib/auth/errors";
import { PlanningCenterConnectionError } from "@/lib/integrations/planningcenter/errors";
import { GET as connect } from "../connect/route";
import { GET as callback } from "../callback/route";

const session = { churchId: "church1", userId: "u1", email: "a@b.c", role: "ADMIN" };
const cbUrl = (qs: string) => new Request(`https://wgc.test/api/merchant/settings/integrations/planning-center/callback?${qs}`);
const location = (r: Response) => decodeURIComponent(r.headers.get("location") ?? "");

beforeEach(() => {
  cookieJar.clear();
  vi.clearAllMocks();
  mockRequirePermission.mockReset();
  mockComplete.mockReset();
  mockRequireSession.mockResolvedValue(session);
});

describe("connect", () => {
  it("redirects to Planning Center with PKCE and stores state, verifier and the SESSION's church", async () => {
    const res = await connect();
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://api.planningcenteronline.com/oauth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(cookieJar.get("wgc_pco_oauth_state")).toBe(url.searchParams.get("state"));
    expect(cookieJar.get("wgc_pco_oauth_verifier")).toBeTruthy();
    expect(cookieJar.get("wgc_pco_oauth_church")).toBe("church1");
  });

  it("is forbidden without canManageIntegrations", async () => {
    mockRequirePermission.mockImplementation(() => {
      throw new ForbiddenError("nope");
    });
    const res = await connect();
    expect(res.status).toBe(403);
    expect(cookieJar.size).toBe(0);
  });
});

describe("callback", () => {
  const armCookies = (over: Record<string, string> = {}) => {
    cookieJar.set("wgc_pco_oauth_state", "good-state");
    cookieJar.set("wgc_pco_oauth_verifier", "verifier");
    cookieJar.set("wgc_pco_oauth_church", "church1");
    for (const [k, v] of Object.entries(over)) cookieJar.set(k, v);
  };

  it("completes the connection and redirects with connected=true", async () => {
    armCookies();
    const res = await callback(cbUrl("code=abc&state=good-state"));
    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ churchId: "church1", code: "abc", codeVerifier: "verifier", actorUserId: "u1" }));
    expect(location(res)).toContain("connected=true");
    expect(cookieJar.size).toBe(0); // one-time cookies are consumed
  });

  it("rejects a state mismatch without exchanging the code", async () => {
    armCookies();
    const res = await callback(cbUrl("code=abc&state=evil"));
    expect(mockComplete).not.toHaveBeenCalled();
    expect(location(res)).toContain("expired or could not be verified");
  });

  it("rejects when the cookies are missing (e.g. a replayed link)", async () => {
    const res = await callback(cbUrl("code=abc&state=good-state"));
    expect(mockComplete).not.toHaveBeenCalled();
    expect(location(res)).toContain("expired or could not be verified");
  });

  it("rejects when the session's church differs from the church that started the flow", async () => {
    armCookies({ wgc_pco_oauth_church: "someone-else" });
    const res = await callback(cbUrl("code=abc&state=good-state"));
    expect(mockComplete).not.toHaveBeenCalled();
    expect(location(res)).toContain("does not match the current organization");
  });

  it("handles the user declining on Planning Center", async () => {
    armCookies();
    const res = await callback(cbUrl("error=access_denied&state=good-state"));
    expect(mockComplete).not.toHaveBeenCalled();
    expect(location(res)).toContain("declined");
  });

  it("rejects a user who lost the permission mid-flow", async () => {
    armCookies();
    mockRequirePermission.mockImplementation(() => {
      throw new ForbiddenError("nope");
    });
    const res = await callback(cbUrl("code=abc&state=good-state"));
    expect(mockComplete).not.toHaveBeenCalled();
    expect(location(res)).toContain("permission");
  });

  it("surfaces a connection refusal (e.g. org already linked) as a friendly redirect", async () => {
    armCookies();
    mockComplete.mockRejectedValue(new PlanningCenterConnectionError("already connected to a different WGC organization"));
    const res = await callback(cbUrl("code=abc&state=good-state"));
    expect(location(res)).toContain("already connected to a different WGC organization");
  });
});
