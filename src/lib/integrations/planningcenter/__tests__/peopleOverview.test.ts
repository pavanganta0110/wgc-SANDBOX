/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { links: [] as any[], donors: [] as any[], jobs: [] as any[] };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterPersonLink: {
      count: async ({ where }: any) => state.links.filter((l) => l.churchId === where.churchId && l.pcoOrganizationId === where.pcoOrganizationId && l.status === where.status).length,
      findMany: async ({ where }: any) => state.links.filter((l) => l.churchId === where.churchId && l.pcoOrganizationId === where.pcoOrganizationId && l.status === where.status),
    },
    donor: { findMany: async ({ where }: any) => state.donors.filter((d) => d.churchId === where.churchId && where.id.in.includes(d.id)) },
    planningCenterPeopleJob: { findFirst: async ({ where }: any) => state.jobs.find((j) => j.churchId === where.churchId && j.type === where.type) ?? null },
  },
}));

import { getPeopleOverview } from "../peopleOverview";

beforeEach(() => {
  state.links = [
    { churchId: "c1", pcoOrganizationId: "org1", status: "LINKED", donorId: "dKeep", candidatesJson: null },
    { churchId: "c1", pcoOrganizationId: "org1", status: "NEEDS_REVIEW", donorId: "dNew", candidatesJson: [
      { pcoPersonId: "p1", name: "Pat Smith", emails: [], phones: [], alreadyLinkedDonorId: "dKeep" },
      { pcoPersonId: "p2", name: "Sam Smith", emails: [], phones: [] },
    ] },
  ];
  state.donors = [
    { id: "dNew", churchId: "c1", name: "Pat S.", email: "pat@x.com", phone: null },
    { id: "dKeep", churchId: "c1", name: "Patricia Smith", email: "pat@x.com", phone: null },
    { id: "dOther", churchId: "c2", name: "Not mine", email: null, phone: null },
  ];
  state.jobs = [];
});

describe("getPeopleOverview", () => {
  it("counts links and lists who needs a decision", async () => {
    const o = await getPeopleOverview("c1", "org1");
    expect(o.counts).toEqual({ linked: 1, needsReview: 1, noMatch: 0 });
    expect(o.review).toHaveLength(1);
    expect(o.review[0]).toMatchObject({ donorId: "dNew", donorName: "Pat S." });
  });

  it("tells the church WHICH existing donor a candidate is already linked to, so they can decide 'same person?'", async () => {
    const [item] = (await getPeopleOverview("c1", "org1")).review;
    expect(item.candidates[0]).toMatchObject({ pcoPersonId: "p1", alreadyLinkedDonorId: "dKeep", alreadyLinkedDonorName: "Patricia Smith" });
    expect(item.candidates[1]).not.toHaveProperty("alreadyLinkedDonorName");
  });

  it("never shows another church's data, or a link made against a different Planning Center organization", async () => {
    state.links.push({ churchId: "c2", pcoOrganizationId: "org1", status: "NEEDS_REVIEW", donorId: "dOther", candidatesJson: [] });
    state.links.push({ churchId: "c1", pcoOrganizationId: "OLD-ORG", status: "NEEDS_REVIEW", donorId: "dStale", candidatesJson: [] });
    const o = await getPeopleOverview("c1", "org1");
    expect(o.review.map((r) => r.donorId)).toEqual(["dNew"]);
    expect(o.counts.needsReview).toBe(1);
  });
});
