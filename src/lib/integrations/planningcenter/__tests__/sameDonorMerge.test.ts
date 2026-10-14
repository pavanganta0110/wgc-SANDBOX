/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fake */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { links: [] as Row[] };
const match = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]: any) => (v && typeof v === "object" && "not" in v ? row[k] !== v.not : row[k] === v));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterPersonLink: {
      findFirst: async ({ where }: any) => db.links.find((l) => match(l, where)) ?? null,
      deleteMany: async ({ where }: any) => {
        const before = db.links.length;
        db.links = db.links.filter((l) => !match(l, where));
        return { count: before - db.links.length };
      },
    },
  },
}));
const audit = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: (...a: unknown[]) => audit(...a) }));
const merge = vi.fn();
vi.mock("@/lib/donors/donorMerge", () => ({ mergeDonors: (...a: unknown[]) => merge(...a) }));

import { findLinkOwner, mergeIntoLinkedDonor } from "../sameDonorMerge";

const actor = { userId: "u1", email: "a@b.c", role: "ADMIN" };

beforeEach(() => {
  merge.mockReset().mockResolvedValue({});
  audit.mockClear();
  db.links = [
    { churchId: "c1", donorId: "dKeep", status: "LINKED", pcoPersonId: "p1" },
    { churchId: "c1", donorId: "dDup", status: "NEEDS_REVIEW", pcoPersonId: null },
  ];
});

describe("mergeIntoLinkedDonor", () => {
  it("merges the second donor INTO the one already linked, so the survivor keeps the Planning Center link", async () => {
    expect(await mergeIntoLinkedDonor("c1", "dDup", "p1", actor)).toEqual({ mergedInto: "dKeep" });
    expect(merge).toHaveBeenCalledWith("dKeep", "dDup", "c1", "u1", "a@b.c");
    expect(db.links.map((l) => l.donorId)).toEqual(["dKeep"]); // the ghost review row is gone
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "planningcenter.donors_merged", metadata: { mergedDonorId: "dDup", pcoPersonId: "p1" } }));
  });

  it("the donor to keep comes from OUR link table, never from the caller: no link owner means nothing to merge", async () => {
    await expect(mergeIntoLinkedDonor("c1", "dDup", "someone-else", actor)).rejects.toThrow(/nothing to merge/);
    expect(merge).not.toHaveBeenCalled();
  });

  it("never reaches another church's link", async () => {
    db.links[0].churchId = "c2";
    await expect(mergeIntoLinkedDonor("c1", "dDup", "p1", actor)).rejects.toThrow(/nothing to merge/);
    expect(merge).not.toHaveBeenCalled();
  });

  it("can't 'merge' a donor into itself, and ignores an unconfirmed link as an owner", async () => {
    expect(await findLinkOwner("c1", "p1", "dKeep")).toBeNull();
    db.links[0].status = "NEEDS_REVIEW";
    expect(await findLinkOwner("c1", "p1", "dDup")).toBeNull();
  });

  it("a merge that fails is reported in plain words, with no raw error, and nothing is cleaned up", async () => {
    merge.mockRejectedValue(new Error("Both donors must belong to the same organization"));
    await expect(mergeIntoLinkedDonor("c1", "dDup", "p1", actor)).rejects.toThrow("Those two donors couldn't be merged. Refresh and try again.");
    expect(db.links).toHaveLength(2);
    expect(audit).not.toHaveBeenCalled();
  });
});
