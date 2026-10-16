/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { links: [] as Row[], givers: [] as Row[], donors: [] as Row[], summaries: new Map<string, any>() };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterPersonLink: { findMany: async () => db.links },
    payment: { groupBy: async () => db.givers },
    donor: { findMany: async ({ where }: any) => db.donors.filter((d) => where.id.in.includes(d.id)) },
  },
}));
vi.mock("../profileSummary", async () => {
  const actual = await vi.importActual<typeof import("../profileSummary")>("../profileSummary");
  return { ...actual, buildDonorSummaries: async (_c: string, ids: string[]) => new Map(ids.map((id) => [id, db.summaries.get(id)])) };
});

import { getProfilePreview } from "../profilePreview";
import { summarizeGifts } from "../profileSummary";

const NOW = new Date("2026-10-14T12:00:00Z");
const sum = (cents: number) => summarizeGifts(cents ? [{ netCents: cents, createdAt: new Date("2026-05-01"), fundName: "General" }] : [], "No", NOW);

beforeEach(() => {
  db.donors = [
    { id: "d1", name: "Ann Lee", anonymousPreference: false },
    { id: "d2", name: "Bob Ray", anonymousPreference: false },
    { id: "d3", name: "Cy Hidden", anonymousPreference: true },
  ];
  db.givers = db.donors.map((d) => ({ donorId: d.id }));
  db.links = [{ donorId: "d2", pcoPersonName: "Robert Ray" }];
  db.summaries = new Map([["d1", sum(90000)], ["d2", sum(10000)], ["d3", sum(5000)]]);
});

describe("getProfilePreview", () => {
  it("counts who would get the section, who isn't matched yet, and who is anonymous", async () => {
    expect((await getProfilePreview("c1", NOW)).counts).toEqual({ matched: 1, notMatched: 1, anonymous: 1 });
  });

  it("shows matched donors first (that's what real profiles will look like), under the Planning Center person's name", async () => {
    const p = await getProfilePreview("c1", NOW);
    expect(p.samples[0]).toMatchObject({ donorName: "Bob Ray", matchedPersonName: "Robert Ray" });
    expect(p.samples[1]).toMatchObject({ donorName: "Ann Lee", matchedPersonName: null });
  });

  it("never shows an anonymous donor", async () => {
    const p = await getProfilePreview("c1", NOW);
    expect(p.samples.map((s) => s.donorName)).not.toContain("Cy Hidden");
  });

  it("describes the section and its fields, and reads naturally", async () => {
    const p = await getProfilePreview("c1", NOW);
    expect(p.sectionName).toBe("WGC Giving");
    expect(p.fields.length).toBeGreaterThan(5);
    expect(p.samples[0].rows.find((r) => r.label === "Lifetime total")?.value).toBe("$100.00");
  });

  it("is fine for a church with no gifts yet", async () => {
    db.givers = [];
    db.donors = [];
    const p = await getProfilePreview("c1", NOW);
    expect(p.samples).toEqual([]);
    expect(p.counts).toEqual({ matched: 0, notMatched: 0, anonymous: 0 });
  });
});
