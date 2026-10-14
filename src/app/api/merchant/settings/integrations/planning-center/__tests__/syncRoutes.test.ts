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

const prismaConn = { findUnique: vi.fn() };
vi.mock("@/lib/prisma", () => ({ prisma: { planningCenterConnection: { findUnique: (a: unknown) => prismaConn.findUnique(a) }, planningCenterPersonLink: { updateMany: async () => ({ count: 0 }) } } }));

const actions = { updateSyncSettings: vi.fn(), retrySyncRecord: vi.fn(), resolveDonationRecord: vi.fn(), syncNow: vi.fn() };
vi.mock("@/lib/integrations/planningcenter/syncActions", () => ({
  updateSyncSettings: (...a: unknown[]) => actions.updateSyncSettings(...a),
  retrySyncRecord: (...a: unknown[]) => actions.retrySyncRecord(...a),
  resolveDonationRecord: (...a: unknown[]) => actions.resolveDonationRecord(...a),
  syncNow: (...a: unknown[]) => actions.syncNow(...a),
}));
const overview = vi.fn();
vi.mock("@/lib/integrations/planningcenter/syncOverview", () => ({ getSyncOverview: (...a: unknown[]) => overview(...a) }));
const people = { getPeopleOverview: vi.fn() };
vi.mock("@/lib/integrations/planningcenter/peopleOverview", () => ({ getPeopleOverview: (...a: unknown[]) => people.getPeopleOverview(...a) }));
const jobs = { startPeopleJob: vi.fn(), processPeopleJob: vi.fn() };
vi.mock("@/lib/integrations/planningcenter/peopleJobs", () => ({ startPeopleJob: (...a: unknown[]) => jobs.startPeopleJob(...a), processPeopleJob: (...a: unknown[]) => jobs.processPeopleJob(...a) }));
const matching = { linkDonorManually: vi.fn(), rejectCandidate: vi.fn(), unlinkDonor: vi.fn(), resolveDonorLink: vi.fn() };
vi.mock("@/lib/integrations/planningcenter/personMatching", () => ({
  linkDonorManually: (...a: unknown[]) => matching.linkDonorManually(...a),
  rejectCandidate: (...a: unknown[]) => matching.rejectCandidate(...a),
  unlinkDonor: (...a: unknown[]) => matching.unlinkDonor(...a),
  resolveDonorLink: (...a: unknown[]) => matching.resolveDonorLink(...a),
}));
vi.mock("@/lib/integrations/planningcenter/service", () => ({ getClientForChurch: async () => ({}) }));

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { PlanningCenterSetupError } from "@/lib/integrations/planningcenter/errors";
import { GET as getSync } from "../sync/route";
import { PUT as putSettings } from "../sync/settings/route";
import { POST as postRun } from "../sync/run/route";
import { POST as postRetry } from "../sync/records/[recordId]/retry/route";
import { POST as postResolve } from "../sync/donations/[donationId]/resolve/route";
import { GET as getPeople } from "../people/route";
import { POST as postJob } from "../people/jobs/route";
import { POST as processJob } from "../people/jobs/[jobId]/process/route";
import { PUT as putLink } from "../people/links/route";

const session = { churchId: "church-from-session", userId: "u1", email: "a@b.c", role: "ADMIN" };
const json = (method: string, body?: unknown) => new Request("https://wgc.test/x", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  vi.clearAllMocks();
  [...Object.values(actions), ...Object.values(people), ...Object.values(jobs), ...Object.values(matching), overview, prismaConn.findUnique].forEach((m) => m.mockReset());
  mockRequirePermission.mockReset();
  mockRequireSession.mockResolvedValue(session);
  prismaConn.findUnique.mockResolvedValue({ status: "CONNECTED", pcoOrganizationId: "org1" });
  enabled = true;
});

describe("guard on every sync and people route", () => {
  const calls: Array<[string, () => Promise<Response>]> = [
    ["GET sync", () => getSync()],
    ["PUT sync/settings", () => putSettings(json("PUT", { syncMode: "OFF" }))],
    ["POST sync/run", () => postRun(json("POST", {}))],
    ["POST retry", () => postRetry(json("POST"), params({ recordId: "r1" }))],
    ["POST resolve", () => postResolve(json("POST", { action: "SKIP" }), params({ donationId: "d1" }))],
    ["GET people", () => getPeople()],
    ["POST people/jobs", () => postJob(json("POST", { type: "MATCH_DONORS" }))],
    ["POST process", () => processJob(json("POST"), params({ jobId: "j1" }))],
    ["PUT people/links", () => putLink(json("PUT", { action: "UNLINK", donorId: "d1" }))],
  ];
  it.each(calls)("%s requires canManageIntegrations", async (_n, call) => {
    mockRequirePermission.mockImplementation(() => { throw new ForbiddenError("nope"); });
    expect((await call()).status).toBe(403);
    expect(prismaConn.findUnique).not.toHaveBeenCalled();
    Object.values({ ...actions, ...jobs, ...matching }).forEach((m) => expect(m).not.toHaveBeenCalled());
  });
  it.each(calls)("%s requires a session", async (_n, call) => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError("no"));
    expect((await call()).status).toBe(401);
  });
  it.each(calls)("%s is 404 when the integration is off", async (_n, call) => {
    enabled = false;
    expect((await call()).status).toBe(404);
  });
});

describe("sync routes", () => {
  it("the church always comes from the session", async () => {
    overview.mockResolvedValue({ ok: true });
    await getSync();
    expect(overview).toHaveBeenCalledWith("church-from-session");
    actions.retrySyncRecord.mockResolvedValue(undefined);
    await postRetry(json("POST"), params({ recordId: "r1" }));
    expect(actions.retrySyncRecord).toHaveBeenCalledWith("church-from-session", "r1", expect.objectContaining({ userId: "u1" }));
  });

  it("settings: validates the body, rejects empty and unknown values, and surfaces a safety refusal as a clear 400", async () => {
    expect((await putSettings(json("PUT", {}))).status).toBe(400);
    expect((await putSettings(json("PUT", { syncMode: "TURBO" }))).status).toBe(400);
    expect((await putSettings(json("PUT", { autoCommitBatches: "yes" }))).status).toBe(400);
    expect(actions.updateSyncSettings).not.toHaveBeenCalled();
    actions.updateSyncSettings.mockRejectedValue(new PlanningCenterSetupError("Run a preview first."));
    const res = await putSettings(json("PUT", { syncMode: "LIVE" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Run a preview first." });
  });

  it("resolve only accepts RETRY or SKIP", async () => {
    expect((await postResolve(json("POST", { action: "DELETE" }), params({ donationId: "d1" }))).status).toBe(400);
    actions.resolveDonationRecord.mockResolvedValue(undefined);
    expect((await postResolve(json("POST", { action: "SKIP" }), params({ donationId: "d1" }))).status).toBe(200);
    expect(actions.resolveDonationRecord).toHaveBeenCalledWith("church-from-session", "d1", "SKIP", expect.anything());
  });

  it("sync now reports how much it did", async () => {
    actions.syncNow.mockResolvedValue({ settlementsProcessed: 3, stoppedForTime: false });
    expect(await (await postRun(json("POST", {}))).json()).toEqual({ success: true, processed: 3, stoppedForTime: false });
  });
});

describe("people routes", () => {
  it("overview is 409 when not connected (so the UI can hide itself)", async () => {
    prismaConn.findUnique.mockResolvedValue({ status: "DISCONNECTED" });
    const res = await getPeople();
    expect(res.status).toBe(409);
  });

  it("starts a job only for the two known types", async () => {
    expect((await postJob(json("POST", { type: "DELETE_EVERYONE" }))).status).toBe(400);
    jobs.startPeopleJob.mockResolvedValue({ id: "j1", status: "PENDING" });
    expect(await (await postJob(json("POST", { type: "IMPORT_PEOPLE" }))).json()).toEqual({ success: true, jobId: "j1", status: "PENDING" });
    expect(jobs.startPeopleJob).toHaveBeenCalledWith("church-from-session", "IMPORT_PEOPLE", expect.anything());
  });

  it("processing a job passes the session church so another church's job id is 'not found'", async () => {
    jobs.processPeopleJob.mockResolvedValue({ id: "j1", type: "MATCH_DONORS", status: "RUNNING", processedCount: 5 });
    await processJob(json("POST"), params({ jobId: "j1" }));
    expect(jobs.processPeopleJob).toHaveBeenCalledWith("church-from-session", "j1");
  });

  it("links validate their shape per action and route to the right function", async () => {
    expect((await putLink(json("PUT", { action: "LINK", donorId: "d1" }))).status).toBe(400); // missing pcoPersonId
    expect((await putLink(json("PUT", { action: "NUKE", donorId: "d1" }))).status).toBe(400);
    matching.linkDonorManually.mockResolvedValue(undefined);
    await putLink(json("PUT", { action: "LINK", donorId: "d1", pcoPersonId: "p1" }));
    expect(matching.linkDonorManually).toHaveBeenCalledWith("church-from-session", "d1", "p1", "org1", expect.anything(), expect.anything());
    await putLink(json("PUT", { action: "REJECT", donorId: "d1", pcoPersonId: "p1" }));
    expect(matching.rejectCandidate).toHaveBeenCalledWith("church-from-session", "d1", "p1", expect.anything());
    await putLink(json("PUT", { action: "UNLINK", donorId: "d1" }));
    expect(matching.unlinkDonor).toHaveBeenCalledWith("church-from-session", "d1", expect.anything());
  });

  it("re-check forces a fresh lookup and reports the result", async () => {
    matching.resolveDonorLink.mockResolvedValue({ status: "LINKED", pcoPersonId: "p1" });
    const res = await putLink(json("PUT", { action: "RECHECK", donorId: "d1" }));
    expect(await res.json()).toEqual({ success: true, status: "LINKED" });
    expect(matching.resolveDonorLink).toHaveBeenCalledWith("church-from-session", "d1", "org1", expect.anything(), { force: true });
  });
});
