import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockRequireSession() }));
const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: unknown[]) => mockRequirePermission(...a) }));

let enabled = true;
vi.mock("@/lib/integrations/planningcenter/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/planningcenter/config")>("@/lib/integrations/planningcenter/config");
  return { ...actual, isPlanningCenterIntegrationEnabled: () => enabled };
});

const setup = {
  getGivingSetupState: vi.fn(),
  ensurePaymentSource: vi.fn(),
  setDefaultFund: vi.fn(),
  saveFundMapping: vi.fn(),
  createPlanningCenterFund: vi.fn(),
  applySuggestedMappings: vi.fn(),
};
vi.mock("@/lib/integrations/planningcenter/givingSetup", () => ({
  getGivingSetupState: (...a: unknown[]) => setup.getGivingSetupState(...a),
  ensurePaymentSource: (...a: unknown[]) => setup.ensurePaymentSource(...a),
  setDefaultFund: (...a: unknown[]) => setup.setDefaultFund(...a),
  saveFundMapping: (...a: unknown[]) => setup.saveFundMapping(...a),
  createPlanningCenterFund: (...a: unknown[]) => setup.createPlanningCenterFund(...a),
  applySuggestedMappings: (...a: unknown[]) => setup.applySuggestedMappings(...a),
}));

import { UnauthorizedError, ForbiddenError } from "@/lib/auth/errors";
import {
  PlanningCenterApiError,
  PlanningCenterConnectionError,
  PlanningCenterSetupError,
  type NormalizedPlanningCenterError,
} from "@/lib/integrations/planningcenter/errors";
import { GET as getState } from "../giving/route";
import { POST as postSource } from "../giving/payment-source/route";
import { PUT as putDefault } from "../giving/default-fund/route";
import { PUT as putMapping } from "../giving/fund-mappings/route";
import { POST as postCreate } from "../giving/fund-mappings/create/route";
import { POST as postAuto } from "../giving/fund-mappings/auto-match/route";

const session = { churchId: "church-from-session", userId: "u1", email: "a@b.c", role: "ADMIN" };
const json = (method: string, body?: unknown) =>
  new Request("https://wgc.test/x", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const rawBody = (method: string, body: string) => new Request("https://wgc.test/x", { method, body });

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(setup).forEach((m) => m.mockReset());
  mockRequirePermission.mockReset();
  mockRequireSession.mockResolvedValue(session);
  enabled = true;
});

describe("guard (applies to every Giving route)", () => {
  const allCalls: Array<[string, () => Promise<Response>]> = [
    ["GET state", () => getState()],
    ["POST payment-source", () => postSource(json("POST"))],
    ["PUT default-fund", () => putDefault(json("PUT", { pcoFundId: "p1" }))],
    ["PUT fund-mappings", () => putMapping(json("PUT", { fundId: "f1", pcoFundId: "p1" }))],
    ["POST create", () => postCreate(json("POST", { fundId: "f1" }))],
    ["POST auto-match", () => postAuto(json("POST"))],
  ];

  it.each(allCalls)("%s requires canManageIntegrations", async (_name, call) => {
    mockRequirePermission.mockImplementation(() => {
      throw new ForbiddenError("nope");
    });
    expect((await call()).status).toBe(403);
    Object.values(setup).forEach((m) => expect(m).not.toHaveBeenCalled());
  });

  it.each(allCalls)("%s requires a session", async (_name, call) => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError("Not signed in"));
    expect((await call()).status).toBe(401);
    Object.values(setup).forEach((m) => expect(m).not.toHaveBeenCalled());
  });

  it.each(allCalls)("%s is 404 when the integration is switched off", async (_name, call) => {
    enabled = false;
    expect((await call()).status).toBe(404);
    Object.values(setup).forEach((m) => expect(m).not.toHaveBeenCalled());
  });
});

describe("tenant isolation", () => {
  it("always passes the church from the SESSION, ignoring any churchId in the body", async () => {
    setup.saveFundMapping.mockResolvedValue({ pcoFundId: "p1", pcoFundName: "General" });
    const res = await putMapping(json("PUT", { fundId: "f1", pcoFundId: "p1", churchId: "someone-elses-church" }));
    expect(res.status).toBe(200);
    expect(setup.saveFundMapping).toHaveBeenCalledWith("church-from-session", "f1", "p1", expect.objectContaining({ userId: "u1" }));
  });

  it("passes the acting user for the audit log on every write", async () => {
    setup.createPlanningCenterFund.mockResolvedValue({ pcoFundId: "p9", pcoFundName: "X" });
    await postCreate(json("POST", { fundId: "f1" }));
    expect(setup.createPlanningCenterFund).toHaveBeenCalledWith("church-from-session", "f1", expect.objectContaining({ userId: "u1", email: "a@b.c", role: "ADMIN" }));
  });
});

describe("request validation", () => {
  it("rejects malformed JSON and wrong shapes with 400 and never calls the service", async () => {
    expect((await putMapping(rawBody("PUT", "{not json"))).status).toBe(400);
    expect((await putMapping(json("PUT", {}))).status).toBe(400);
    expect((await putMapping(json("PUT", { fundId: "", pcoFundId: "p1" }))).status).toBe(400);
    expect((await putMapping(json("PUT", { fundId: "f1", pcoFundId: 5 }))).status).toBe(400);
    expect((await putDefault(json("PUT", { pcoFundId: undefined }))).status).toBe(400);
    expect((await postCreate(json("POST", { fundId: 12 }))).status).toBe(400);
    expect((await putMapping(json("PUT", { fundId: "x".repeat(65), pcoFundId: "p1" }))).status).toBe(400);
    expect(setup.saveFundMapping).not.toHaveBeenCalled();
    expect(setup.setDefaultFund).not.toHaveBeenCalled();
    expect(setup.createPlanningCenterFund).not.toHaveBeenCalled();
  });

  it("null pcoFundId is the way to unmap / clear", async () => {
    setup.saveFundMapping.mockResolvedValue(null);
    setup.setDefaultFund.mockResolvedValue(null);
    expect((await putMapping(json("PUT", { fundId: "f1", pcoFundId: null }))).status).toBe(200);
    expect((await putDefault(json("PUT", { pcoFundId: null }))).status).toBe(200);
  });
});

describe("responses and error mapping", () => {
  it("returns the setup state", async () => {
    setup.getGivingSetupState.mockResolvedValue({ pcoAccess: "OK", funds: [] });
    const res = await getState();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pcoAccess: "OK", funds: [] });
    expect(setup.getGivingSetupState).toHaveBeenCalledWith("church-from-session");
  });

  it("maps a setup problem to 400 with its message", async () => {
    setup.createPlanningCenterFund.mockRejectedValue(new PlanningCenterSetupError("A fund named “X” already exists."));
    const res = await postCreate(json("POST", { fundId: "f1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A fund named “X” already exists." });
  });

  it("maps 'not connected' to 409 with a code the UI can use to hide itself", async () => {
    setup.getGivingSetupState.mockRejectedValue(new PlanningCenterConnectionError("Connect Planning Center first."));
    const res = await getState();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_CONNECTED");
  });

  it("maps Planning Center failures: 403, 429 and 5xx, using safe messages only", async () => {
    const mk = (category: NormalizedPlanningCenterError["category"], retryable: boolean, status: number) =>
      new PlanningCenterApiError({ category, retryable, safeMessage: `safe ${category}`, rawDetail: "SECRET DETAIL" }, status);
    setup.ensurePaymentSource.mockRejectedValueOnce(mk("ACCESS_DENIED", false, 403));
    let res = await postSource(json("POST"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "safe ACCESS_DENIED", code: "ACCESS_DENIED" });

    setup.ensurePaymentSource.mockRejectedValueOnce(mk("RATE_LIMITED", true, 429));
    expect((await postSource(json("POST"))).status).toBe(429);

    setup.ensurePaymentSource.mockRejectedValueOnce(mk("TEMPORARY_PLANNING_CENTER_ERROR", true, 503));
    res = await postSource(json("POST"));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET DETAIL");
  });

  it("does not swallow unexpected errors", async () => {
    setup.applySuggestedMappings.mockRejectedValue(new Error("boom"));
    await expect(postAuto(json("POST"))).rejects.toThrow("boom");
  });

  it("auto-match returns the counts", async () => {
    setup.applySuggestedMappings.mockResolvedValue({ mapped: 3, skipped: 1 });
    expect(await (await postAuto(json("POST"))).json()).toEqual({ success: true, mapped: 3, skipped: 1 });
  });
});
