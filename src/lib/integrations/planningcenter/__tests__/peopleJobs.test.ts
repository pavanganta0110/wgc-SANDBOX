/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fake of a few Prisma tables */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = {
  connection: null as Row | null,
  jobs: [] as Row[],
  payments: [] as Row[],
  donors: [] as Row[],
  links: [] as Row[],
};
let seq = 1;

vi.mock("@/lib/prisma", () => {
  const applyData = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      row[k] = v && typeof v === "object" && "increment" in v ? (row[k] ?? 0) + v.increment : v;
    }
    return row;
  };
  const prisma: any = {
    planningCenterConnection: { findUnique: async () => (db.connection ? { ...db.connection } : null) },
    planningCenterPeopleJob: {
      findFirst: async ({ where }: any) =>
        [...db.jobs].reverse().find((j) => Object.entries(where).every(([k, v]: any) => (v && typeof v === "object" && "in" in v ? v.in.includes(j[k]) : j[k] === v))) ?? null,
      create: async ({ data }: any) => {
        const job = { id: `j${seq++}`, status: "PENDING", cursorJson: null, totalCount: null, processedCount: 0, linkedCount: 0, reviewCount: 0, noMatchCount: 0, createdCount: 0, skippedCount: 0, failedCount: 0, createdAt: new Date(), ...data };
        db.jobs.push(job);
        return job;
      },
      update: async ({ where, data }: any) => applyData(db.jobs.find((j) => j.id === where.id)!, data),
    },
    payment: {
      groupBy: async ({ where, take }: any) => {
        const ids = [...new Set(db.payments.filter((p) => p.churchId === where.churchId && where.status.in.includes(p.status) && p.donorId).map((p) => p.donorId))].sort() as string[];
        const after = where.donorId?.gt;
        const filtered = after !== undefined ? ids.filter((id) => id > after) : ids;
        return (take ? filtered.slice(0, take) : filtered).map((donorId) => ({ donorId }));
      },
    },
    donor: { findMany: async ({ where }: any) => db.donors.filter((d) => d.churchId === where.churchId && where.id.in.includes(d.id) && d.archivedAt === null) },
    planningCenterPersonLink: {
      findUnique: async ({ where }: any) => db.links.find((l) => l.churchId === where.churchId_donorId.churchId && l.donorId === where.churchId_donorId.donorId) ?? null,
      findFirst: async ({ where }: any) => db.links.find((l) => l.churchId === where.churchId && l.pcoPersonId === where.pcoPersonId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = db.links.find((l) => l.churchId === where.churchId_donorId.churchId && l.donorId === where.churchId_donorId.donorId);
        if (existing) return Object.assign(existing, update);
        db.links.push({ ...create });
        return create;
      },
    },
  };
  return { prisma };
});
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn(async () => {}) }));
vi.mock("../service", () => ({ getClientForChurch: vi.fn(async () => ({})) }));

const resolveDonorLinkMock = vi.fn();
vi.mock("../personMatching", () => ({ resolveDonorLink: (...a: unknown[]) => resolveDonorLinkMock(...a) }));
const listPeoplePageMock = vi.fn();
vi.mock("../people", () => ({ listPeoplePage: (...a: unknown[]) => listPeoplePageMock(...a) }));
const resolveOrCreateMock = vi.fn();
vi.mock("@/lib/donors/resolveOrCreateDonorWithMatchReview", () => ({ resolveOrCreateDonorWithMatchReview: (...a: unknown[]) => resolveOrCreateMock(...a) }));

import { PlanningCenterApiError, PlanningCenterConnectionError, PlanningCenterSetupError } from "../errors";
import { processPeopleJob, startPeopleJob } from "../peopleJobs";

const actor = { userId: "u1" };
const apiError = (category: any, status: number) => new PlanningCenterApiError({ category, retryable: false, safeMessage: "x" }, status);
const pay = (donorId: string | null, status = "SUCCEEDED", churchId = "c1") => ({ churchId, donorId, status });
const donor = (id: string, archivedAt: Date | null = null) => ({ id, churchId: "c1", archivedAt });
const pco = (id: string, name: string, extra: Row = {}) => ({ id, name, isInactive: false, isChild: false, emails: [], phones: [], ...extra });

beforeEach(() => {
  seq = 1;
  db.connection = { status: "CONNECTED", pcoOrganizationId: "org1" };
  db.jobs = [];
  db.payments = [];
  db.donors = [];
  db.links = [];
  resolveDonorLinkMock.mockReset();
  listPeoplePageMock.mockReset();
  resolveOrCreateMock.mockReset();
});

describe("startPeopleJob", () => {
  it("requires a connected church", async () => {
    db.connection = { status: "DISCONNECTED" };
    await expect(startPeopleJob("c1", "MATCH_DONORS", actor)).rejects.toBeInstanceOf(PlanningCenterConnectionError);
  });

  it("returns the already-running job instead of starting a second one, per type", async () => {
    const a = await startPeopleJob("c1", "MATCH_DONORS", actor);
    expect((await startPeopleJob("c1", "MATCH_DONORS", actor)).id).toBe(a.id);
    expect((await startPeopleJob("c1", "IMPORT_PEOPLE", actor)).id).not.toBe(a.id);
  });
});

describe("MATCH_DONORS", () => {
  beforeEach(() => {
    db.payments = [pay("d1"), pay("d1"), pay("d2"), pay("d3"), pay("d4"), pay("dFail", "FAILED"), pay("other", "SUCCEEDED", "c2"), pay(null)];
    db.donors = [donor("d1"), donor("d2"), donor("d3", new Date()), donor("d4")];
  });

  it("matches only donors who have given, skips archived ones, and tallies outcomes", async () => {
    resolveDonorLinkMock.mockImplementation(async (_c: string, donorId: string) => ({ d1: { status: "LINKED" }, d2: { status: "NEEDS_REVIEW" }, d4: { status: "NO_MATCH" } } as any)[donorId]);
    const job = await startPeopleJob("c1", "MATCH_DONORS", actor);
    const done = await processPeopleJob("c1", job.id, { client: {} as any });
    expect(done).toMatchObject({ status: "COMPLETED", totalCount: 4, processedCount: 4, linkedCount: 1, reviewCount: 1, noMatchCount: 1, skippedCount: 1 });
    expect(resolveDonorLinkMock.mock.calls.map((c) => c[1])).toEqual(["d1", "d2", "d4"]);
    expect(resolveDonorLinkMock.mock.calls.map((c) => c[1])).not.toContain("dFail");
  });

  it("resumes where it stopped when the time budget runs out (nothing is processed twice)", async () => {
    resolveDonorLinkMock.mockResolvedValue({ status: "LINKED" });
    const job = await startPeopleJob("c1", "MATCH_DONORS", actor);
    let t = 0;
    const tick = () => (t += 1); // each now() call advances one tick; a 3-tick budget interrupts after the first donor
    const first = await processPeopleJob("c1", job.id, { client: {} as any, timeBudgetMs: 3, now: tick });
    expect(first.status).toBe("RUNNING");
    const before = resolveDonorLinkMock.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(3);
    const second = await processPeopleJob("c1", job.id, { client: {} as any });
    expect(second.status).toBe("COMPLETED");
    const seen = resolveDonorLinkMock.mock.calls.map((c) => c[1]);
    expect(new Set(seen).size).toBe(seen.length); // no donor matched twice
    expect(second.linkedCount).toBe(3); // d1, d2, d4 (d3 archived)
  });

  it("a failure on one donor is counted and the job carries on", async () => {
    resolveDonorLinkMock.mockImplementation(async (_c: string, id: string) => {
      if (id === "d2") throw new Error("weird record");
      return { status: "LINKED" };
    });
    const job = await startPeopleJob("c1", "MATCH_DONORS", actor);
    expect(await processPeopleJob("c1", job.id, { client: {} as any })).toMatchObject({ status: "COMPLETED", failedCount: 1, linkedCount: 2 });
  });

  it("an authentication problem fails the whole job with a message", async () => {
    resolveDonorLinkMock.mockRejectedValue(apiError("AUTHENTICATION_REQUIRED", 401));
    const job = await startPeopleJob("c1", "MATCH_DONORS", actor);
    const result = await processPeopleJob("c1", job.id, { client: {} as any });
    expect(result.status).toBe("FAILED");
    expect(result.lastError).toBeTruthy();
  });

  it("rate limiting PAUSES the job (still RUNNING) instead of failing it", async () => {
    resolveDonorLinkMock.mockRejectedValue(apiError("RATE_LIMITED", 429));
    const job = await startPeopleJob("c1", "MATCH_DONORS", actor);
    const result = await processPeopleJob("c1", job.id, { client: {} as any });
    expect(result.status).toBe("RUNNING");
    expect(result.lastError).toMatch(/slow down/);
  });

  it("a finished job is returned untouched, and another church's job id is 'not found'", async () => {
    resolveDonorLinkMock.mockResolvedValue({ status: "LINKED" });
    const job = await startPeopleJob("c1", "MATCH_DONORS", actor);
    await processPeopleJob("c1", job.id, { client: {} as any });
    const calls = resolveDonorLinkMock.mock.calls.length;
    await processPeopleJob("c1", job.id, { client: {} as any });
    expect(resolveDonorLinkMock.mock.calls.length).toBe(calls);
    await expect(processPeopleJob("someone-else", job.id, { client: {} as any })).rejects.toBeInstanceOf(PlanningCenterSetupError);
  });
});

describe("IMPORT_PEOPLE", () => {
  it("skips inactive people, children and people with no email or phone; imports and links the rest", async () => {
    listPeoplePageMock.mockResolvedValue({
      hasMore: false,
      people: [
        pco("1", "Pat Smith", { emails: ["pat@example.com"] }),
        pco("2", "Gone", { emails: ["gone@example.com"], isInactive: true }),
        pco("3", "Kid", { emails: ["kid@example.com"], isChild: true }),
        pco("4", "No Contact"),
        pco("5", "Phone Only", { phones: ["+18165550100"] }),
      ],
    });
    resolveOrCreateMock.mockImplementation(async (input: Row) => ({ id: `donor-${input.sourceId}`, created: true, updated: false }));
    const job = await startPeopleJob("c1", "IMPORT_PEOPLE", actor);
    const done = await processPeopleJob("c1", job.id, { client: {} as any });

    expect(done).toMatchObject({ status: "COMPLETED", processedCount: 5, createdCount: 2, skippedCount: 3, linkedCount: 2 });
    expect(resolveOrCreateMock).toHaveBeenCalledTimes(2);
    expect(resolveOrCreateMock.mock.calls[0][0]).toMatchObject({ churchId: "c1", email: "pat@example.com", contactSource: "PLANNING_CENTER", sourceType: "PLANNING_CENTER_IMPORT", actorUserId: "u1" });
    expect(db.links.map((l) => [l.donorId, l.pcoPersonId, l.matchMethod])).toEqual([["donor-1", "1", "EMAIL"], ["donor-5", "5", "PHONE"]]);
  });

  it("never links a person who is already linked to a donor, or a donor already linked", async () => {
    db.links = [
      { churchId: "c1", donorId: "donor-1", status: "LINKED", pcoPersonId: "someone-else", rejectedPcoPersonIds: [] },
      { churchId: "c1", donorId: "donorX", status: "LINKED", pcoPersonId: "2", rejectedPcoPersonIds: [] },
    ];
    listPeoplePageMock.mockResolvedValue({ hasMore: false, people: [pco("1", "A", { emails: ["a@x.com"] }), pco("2", "B", { emails: ["b@x.com"] })] });
    resolveOrCreateMock.mockImplementation(async (input: Row) => ({ id: `donor-${input.sourceId}`, created: false, updated: false }));
    const job = await startPeopleJob("c1", "IMPORT_PEOPLE", actor);
    const done = await processPeopleJob("c1", job.id, { client: {} as any });
    expect(done.linkedCount).toBe(0);
    expect(db.links).toHaveLength(2);
  });

  it("never re-links a donor to a person the church already rejected", async () => {
    db.links = [{ churchId: "c1", donorId: "donor-1", status: "NO_MATCH", pcoPersonId: null, rejectedPcoPersonIds: ["1"] }];
    listPeoplePageMock.mockResolvedValue({ hasMore: false, people: [pco("1", "A", { emails: ["a@x.com"] })] });
    resolveOrCreateMock.mockResolvedValue({ id: "donor-1", created: false, updated: false });
    const job = await startPeopleJob("c1", "IMPORT_PEOPLE", actor);
    const done = await processPeopleJob("c1", job.id, { client: {} as any });
    expect(done.linkedCount).toBe(0);
    expect(db.links[0].status).toBe("NO_MATCH");
  });

  it("walks the directory page by page until Planning Center says there is no more", async () => {
    listPeoplePageMock
      .mockResolvedValueOnce({ hasMore: true, people: [pco("1", "A", { emails: ["a@x.com"] })] })
      .mockResolvedValueOnce({ hasMore: false, people: [pco("2", "B", { emails: ["b@x.com"] })] });
    resolveOrCreateMock.mockImplementation(async (input: Row) => ({ id: `donor-${input.sourceId}`, created: true, updated: false }));
    const job = await startPeopleJob("c1", "IMPORT_PEOPLE", actor);
    const done = await processPeopleJob("c1", job.id, { client: {} as any });
    expect(listPeoplePageMock.mock.calls.map((c) => c[1])).toEqual([0, 1]);
    expect(done).toMatchObject({ status: "COMPLETED", createdCount: 2 });
  });
});
