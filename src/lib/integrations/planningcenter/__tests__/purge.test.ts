/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { links: [] as Row[], jobs: [] as Row[], configs: [] as Row[], donors: [{ id: "d1", churchId: "c1" }] as Row[] };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterPersonLink: { deleteMany: ({ where }: any) => { const n = db.links.filter((r) => r.churchId === where.churchId).length; db.links = db.links.filter((r) => r.churchId !== where.churchId); return Promise.resolve({ count: n }); } },
    planningCenterPeopleJob: { deleteMany: ({ where }: any) => { const n = db.jobs.filter((r) => r.churchId === where.churchId).length; db.jobs = db.jobs.filter((r) => r.churchId !== where.churchId); return Promise.resolve({ count: n }); } },
    planningCenterSyncConfig: { updateMany: ({ where, data }: any) => { const hit = db.configs.filter((r) => r.churchId === where.churchId); hit.forEach((r) => Object.assign(r, data)); return Promise.resolve({ count: hit.length }); } },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { purgePlanningCenterPeopleData } from "../purge";

beforeEach(() => {
  db.links = [
    { churchId: "c1", donorId: "d1", pcoPersonName: "Ann", candidatesJson: [{ name: "Ann", emails: ["a@x.org"] }] },
    { churchId: "c1", donorId: "d2", pcoPersonName: "Bob" },
    { churchId: "c2", donorId: "d9", pcoPersonName: "Other church" },
  ];
  db.jobs = [{ churchId: "c1" }, { churchId: "c2" }];
  db.configs = [{ churchId: "c1", pcoProfileTabId: "t1", pcoProfileFieldIds: { a: "1" }, pcoPaymentSourceId: "ps1" }, { churchId: "c2", pcoProfileTabId: "t2" }];
});

describe("purgePlanningCenterPeopleData", () => {
  it("deletes this church's matched-person records and job history, and reports how many", async () => {
    expect(await purgePlanningCenterPeopleData("c1")).toEqual({ deletedLinks: 2, deletedJobs: 1 });
    expect(db.links.filter((l) => l.churchId === "c1")).toHaveLength(0);
    expect(db.jobs.filter((j) => j.churchId === "c1")).toHaveLength(0);
  });

  it("never touches another church's data", async () => {
    await purgePlanningCenterPeopleData("c1");
    expect(db.links).toHaveLength(1);
    expect(db.links[0].churchId).toBe("c2");
    expect(db.jobs).toHaveLength(1);
    expect(db.configs[1].pcoProfileTabId).toBe("t2");
  });

  it("clears the stored profile section ids but keeps the church's Giving setup", async () => {
    await purgePlanningCenterPeopleData("c1");
    expect(db.configs[0].pcoProfileTabId).toBeNull();
    expect(db.configs[0].pcoProfileFieldIds).not.toEqual({ a: "1" });
    expect(db.configs[0].pcoPaymentSourceId).toBe("ps1");
  });

  it("does not delete donors (they hold payments and receipts)", async () => {
    await purgePlanningCenterPeopleData("c1");
    expect(db.donors).toHaveLength(1);
  });

  it("is safe to run twice and on a church with nothing stored", async () => {
    await purgePlanningCenterPeopleData("c1");
    expect(await purgePlanningCenterPeopleData("c1")).toEqual({ deletedLinks: 0, deletedJobs: 0 });
    expect(await purgePlanningCenterPeopleData("nobody")).toEqual({ deletedLinks: 0, deletedJobs: 0 });
  });
});
