/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { connection: null as Row | null, donors: [] as Row[], links: [] as Row[], summaries: new Map<string, any>() };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterConnection: { findUnique: async () => db.connection },
    donor: {
      findFirst: async ({ where }: any) => db.donors.find((d) => d.id === where.id && d.churchId === where.churchId) ?? null,
      findMany: async () => db.donors.filter((d) => !d.archivedAt && !d.mergedIntoDonorId && !d.anonymousPreference),
    },
    planningCenterPersonLink: {
      findUnique: async ({ where }: any) => db.links.find((l) => l.donorId === where.churchId_donorId.donorId) ?? null,
      findMany: async () => db.links.filter((l) => l.status === "LINKED" && l.pcoPersonId),
      update: async ({ where, data }: any) => Object.assign(db.links.find((l) => l.donorId === where.churchId_donorId.donorId)!, data),
    },
  },
}));
vi.mock("../service", () => ({ getClientForChurch: async () => ({}) }));
const linkStates = new Map<string, any>();
vi.mock("../personMatching", () => ({ resolveDonorLink: async (_c: string, donorId: string) => linkStates.get(donorId) ?? { status: "NO_MATCH", pcoPersonId: null } }));
const setupMock = vi.fn();
const storedMock = vi.fn();
const writeMock = vi.fn();
vi.mock("../profileFields", () => ({
  ensureProfileSetup: (...a: unknown[]) => setupMock(...a),
  getStoredProfileSetup: (...a: unknown[]) => storedMock(...a),
  writeProfileValues: (...a: unknown[]) => writeMock(...a),
}));
vi.mock("../profileSummary", async () => {
  const actual = await vi.importActual<typeof import("../profileSummary")>("../profileSummary");
  return { ...actual, buildDonorSummaries: async (_c: string, ids: string[]) => new Map(ids.map((id) => [id, db.summaries.get(id) ?? actual.summarizeGifts([], "No", new Date())])) };
});

import { PlanningCenterApiError, PlanningCenterSetupError } from "../errors";
import { PROFILE_REVERIFY_MS, syncProfileForDonor, syncProfilesForChurch } from "../profileSync";
import { summarizeGifts } from "../profileSummary";

const NOW = new Date("2026-10-14T12:00:00Z");
const given = (cents: number) => summarizeGifts([{ netCents: cents, createdAt: new Date("2026-05-01"), fundName: "General" }], "No", NOW);

beforeEach(() => {
  [setupMock, storedMock, writeMock].forEach((m) => m.mockReset());
  linkStates.clear();
  db.connection = { status: "CONNECTED", pcoOrganizationId: "org1" };
  db.donors = [{ id: "d1", churchId: "c1", anonymousPreference: false, archivedAt: null, mergedIntoDonorId: null }];
  db.links = [{ churchId: "c1", donorId: "d1", status: "LINKED", pcoPersonId: "person1", profileDigest: null, profileSyncedAt: null }];
  db.summaries = new Map([["d1", given(10000)]]);
  linkStates.set("d1", { status: "LINKED", pcoPersonId: "person1" });
  storedMock.mockResolvedValue({ tabId: "t1", fieldIds: {} });
  writeMock.mockResolvedValue({ written: 3, unchanged: 7 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncProfileForDonor", () => {
  it("writes the donor's giving onto their matched person and remembers what it wrote", async () => {
    expect(await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW })).toBe("UPDATED");
    expect(writeMock).toHaveBeenCalledWith(expect.anything(), "person1", expect.anything(), expect.objectContaining({ given_this_year: "100.00", lifetime_total: "100.00", gift_count: "1" }));
    expect(db.links[0].profileDigest).toBeTruthy();
    expect(db.links[0].profileSyncedAt).toEqual(NOW);
  });

  it("does nothing, and makes no Planning Center call, when nothing changed since the last write", async () => {
    await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW });
    writeMock.mockClear();
    expect(await syncProfileForDonor("c1", "d1", { client: {} as any, now: new Date(NOW.getTime() + 60_000) })).toBe("UNCHANGED");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("checks again after a week even if nothing changed (repairs a value someone deleted)", async () => {
    await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW });
    writeMock.mockClear();
    await syncProfileForDonor("c1", "d1", { client: {} as any, now: new Date(NOW.getTime() + PROFILE_REVERIFY_MS + 1000) });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("writes again when a new gift changes the totals", async () => {
    await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW });
    db.summaries.set("d1", given(25000));
    writeMock.mockClear();
    expect(await syncProfileForDonor("c1", "d1", { client: {} as any, now: new Date(NOW.getTime() + 1000) })).toBe("UPDATED");
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("never writes for a donor who asked to stay anonymous, an archived donor, or a merged-away donor", async () => {
    for (const over of [{ anonymousPreference: true }, { archivedAt: new Date() }, { mergedIntoDonorId: "d2" }]) {
      Object.assign(db.donors[0], { anonymousPreference: false, archivedAt: null, mergedIntoDonorId: null }, over);
      expect(await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW })).toBe("SKIPPED");
    }
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("a donor with no matched person gets nothing written (and no person is created)", async () => {
    linkStates.set("d1", { status: "NO_MATCH", pcoPersonId: null });
    expect(await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW })).toBe("UNMATCHED");
    linkStates.set("d1", { status: "NEEDS_REVIEW", pcoPersonId: null });
    expect(await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW })).toBe("UNMATCHED");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("does nothing when Planning Center isn't connected, and never throws on a Planning Center failure", async () => {
    db.connection = { status: "DISCONNECTED", pcoOrganizationId: null };
    expect(await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW })).toBe("SKIPPED");
    db.connection = { status: "CONNECTED", pcoOrganizationId: "org1" };
    writeMock.mockRejectedValue(new Error("boom"));
    expect(await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW })).toBe("FAILED");
    expect(db.links[0].profileDigest).toBeNull(); // not remembered, so it's tried again
  });

  it("sets up the section the first time if it isn't there yet", async () => {
    storedMock.mockResolvedValue(null);
    setupMock.mockResolvedValue({ tabId: "t1", fieldIds: {} });
    await syncProfileForDonor("c1", "d1", { client: {} as any, now: NOW });
    expect(setupMock).toHaveBeenCalledTimes(1);
  });
});

describe("syncProfilesForChurch", () => {
  const two = () => {
    db.donors.push({ id: "d2", churchId: "c1", anonymousPreference: false, archivedAt: null, mergedIntoDonorId: null });
    db.links.push({ churchId: "c1", donorId: "d2", status: "LINKED", pcoPersonId: "person2", profileDigest: null, profileSyncedAt: null });
    db.summaries.set("d2", given(5000));
  };

  it("updates everyone who is out of date, once", async () => {
    two();
    const r = await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW });
    expect(r.updated).toBe(2);
    expect(writeMock).toHaveBeenCalledTimes(2);
    writeMock.mockClear();
    const again = await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW });
    expect(again).toMatchObject({ updated: 0, unchanged: 2 });
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("makes no Planning Center call at all when everyone is up to date", async () => {
    await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW });
    storedMock.mockClear();
    await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW });
    expect(storedMock).not.toHaveBeenCalled();
  });

  it("leaves out anonymous and archived donors", async () => {
    two();
    db.donors[1].anonymousPreference = true;
    const r = await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW });
    expect(r.updated).toBe(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("stops everyone when Planning Center refuses us, but one person's odd failure doesn't stop the rest", async () => {
    two();
    writeMock.mockRejectedValueOnce(new Error("one bad profile"));
    let r = await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW });
    expect(r).toMatchObject({ failed: 1, updated: 1 });

    db.links.forEach((l) => { l.profileDigest = null; l.profileSyncedAt = null; });
    writeMock.mockReset();
    writeMock.mockRejectedValue(new PlanningCenterSetupError("needs a People administrator"));
    r = await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW });
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(r.updated).toBe(0);

    db.links.forEach((l) => { l.profileDigest = null; l.profileSyncedAt = null; });
    writeMock.mockReset();
    writeMock.mockRejectedValue(new PlanningCenterApiError({ category: "RATE_LIMITED", safeMessage: "slow", retryable: true }, 429));
    await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("stops when the time budget runs out and picks up the rest next time", async () => {
    two();
    let t = NOW.getTime();
    const clock = () => new Date((t += 20_000));
    const r = await syncProfilesForChurch("c1", { client: {} as any, now: clock, timeBudgetMs: 45_000 });
    expect(r.stoppedForTime).toBe(true);
    expect(writeMock.mock.calls.length).toBeLessThan(2);
  });

  it("does nothing for a church that isn't connected", async () => {
    db.connection = null;
    expect(await syncProfilesForChurch("c1", { client: {} as any, now: () => NOW })).toMatchObject({ updated: 0 });
    expect(writeMock).not.toHaveBeenCalled();
  });
});
