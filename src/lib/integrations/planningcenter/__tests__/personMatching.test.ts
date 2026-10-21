/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fake of a few Prisma tables */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { donors: [] as Row[], links: [] as Row[] };
let nextId = 1;

const matchWhere = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === "churchId_donorId") return row.churchId === v.churchId && row.donorId === v.donorId;
    if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
    if (v && typeof v === "object" && "not" in v) return row[k] !== v.not;
    return row[k] === v;
  });

vi.mock("@/lib/prisma", () => {
  const prisma: any = {
    donor: { findFirst: async ({ where }: any) => db.donors.find((d) => matchWhere(d, where)) ?? null },
    planningCenterPersonLink: {
      findUnique: async ({ where }: any) => db.links.find((l) => matchWhere(l, where)) ?? null,
      findFirst: async ({ where }: any) => db.links.find((l) => matchWhere(l, where)) ?? null,
      findMany: async ({ where }: any) => db.links.filter((l) => matchWhere(l, where)),
      upsert: async ({ where, create, update }: any) => {
        const existing = db.links.find((l) => matchWhere(l, where));
        const next = existing ? Object.assign(existing, update) : { id: `l${nextId++}`, ...create };
        const clash = db.links.find((l) => l !== next && next.pcoPersonId && l.churchId === next.churchId && l.pcoPersonId === next.pcoPersonId);
        if (clash) {
          const { Prisma } = await import("@prisma/client");
          throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" });
        }
        if (!existing) db.links.push(next);
        return next;
      },
      update: async ({ where, data }: any) => Object.assign(db.links.find((l) => (where.id ? l.id === where.id : matchWhere(l, where)))!, data),
      delete: async ({ where }: any) => {
        db.links = db.links.filter((l) => l.id !== where.id);
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma };
});
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn(async () => {}) }));

const searchPeopleMock = vi.fn();
const getPersonMock = vi.fn();
vi.mock("../people", () => ({ searchPeople: (...a: unknown[]) => searchPeopleMock(...a), getPerson: (...a: unknown[]) => getPersonMock(...a) }));

import { PlanningCenterSetupError } from "../errors";
import type { PcoPersonContact } from "../people";
import { decideMatch, linkDonorManually, moveLinkOnDonorMerge, rejectCandidate, resolveDonorLink, unlinkDonor } from "../personMatching";

const person = (id: string, name: string, extra: Partial<PcoPersonContact> = {}): PcoPersonContact => ({
  id, name, firstName: null, lastName: null, isInactive: false, isChild: false, emails: [], phones: [], ...extra,
});
const donor = { name: "Pat Smith", normalizedEmail: "pat@example.com", normalizedPhone: "+18165550100" };
const ctx = (over: Partial<{ linkedElsewhere: Map<string, string>; rejected: Set<string> }> = {}) => ({ linkedElsewhere: new Map<string, string>(), rejected: new Set<string>(), ...over });
const noPeople = { byEmail: [], byPhone: [] };

describe("decideMatch", () => {
  it("links a single exact email match, whatever the name", () => {
    const r = decideMatch(donor, { byEmail: [person("1", "Patricia S.", { emails: ["pat@example.com"] })], byPhone: [] }, ctx());
    expect(r).toMatchObject({ kind: "LINKED", method: "EMAIL" });
  });

  it("verifies the email exactly: a fuzzy 'contains' hit on a different address is not a match", () => {
    const r = decideMatch(donor, { byEmail: [person("1", "Other", { emails: ["pat@example.com.au"] })], byPhone: [] }, ctx());
    expect(r.kind).toBe("NO_MATCH");
  });

  it("NEVER auto-links when several people share the email (spouses) unless exactly one has the donor's exact full name", () => {
    const spouses = [person("1", "Pat Smith", { emails: ["pat@example.com"] }), person("2", "Sam Smith", { emails: ["pat@example.com"] })];
    expect(decideMatch(donor, { byEmail: spouses, byPhone: [] }, ctx())).toMatchObject({ kind: "LINKED", method: "EMAIL_NAME", person: { id: "1" } });

    const noNameMatch = decideMatch({ ...donor, name: "The Smiths" }, { byEmail: spouses, byPhone: [] }, ctx());
    expect(noNameMatch).toMatchObject({ kind: "NEEDS_REVIEW" });
    expect((noNameMatch as any).candidates.map((c: any) => c.pcoPersonId)).toEqual(["1", "2"]);

    const twinsWithSameName = [person("1", "Pat Smith", { emails: ["pat@example.com"] }), person("2", "pat  SMITH", { emails: ["pat@example.com"] })];
    expect(decideMatch(donor, { byEmail: twinsWithSameName, byPhone: [] }, ctx()).kind).toBe("NEEDS_REVIEW");
  });

  it("a donor with no name never gets the name tie-breaker", () => {
    const spouses = [person("1", "Pat Smith", { emails: ["pat@example.com"] }), person("2", "Sam Smith", { emails: ["pat@example.com"] })];
    expect(decideMatch({ ...donor, name: null }, { byEmail: spouses, byPhone: [] }, ctx()).kind).toBe("NEEDS_REVIEW");
  });

  it("phone-only: links only when the name also matches exactly, otherwise asks a human (shared household phones)", () => {
    const d = { ...donor, normalizedEmail: null };
    const same = decideMatch(d, { byEmail: [], byPhone: [person("1", "Pat Smith", { phones: ["+18165550100"] })] }, ctx());
    expect(same).toMatchObject({ kind: "LINKED", method: "PHONE" });
    const different = decideMatch(d, { byEmail: [], byPhone: [person("1", "Sam Smith", { phones: ["+18165550100"] })] }, ctx());
    expect(different.kind).toBe("NEEDS_REVIEW");
    const several = decideMatch(d, { byEmail: [], byPhone: [person("1", "Pat Smith", { phones: ["+18165550100"] }), person("2", "Lee", { phones: ["+18165550100"] })] }, ctx());
    expect(several.kind).toBe("NEEDS_REVIEW");
  });

  it("never matches on name alone", () => {
    expect(decideMatch({ name: "Pat Smith", normalizedEmail: null, normalizedPhone: null }, { byEmail: [person("1", "Pat Smith")], byPhone: [person("1", "Pat Smith")] }, ctx()).kind).toBe("NO_MATCH");
  });

  it("ignores inactive people, children and anyone the church already rejected", () => {
    const people = [
      person("1", "Gone", { emails: ["pat@example.com"], isInactive: true }),
      person("2", "Kid", { emails: ["pat@example.com"], isChild: true }),
      person("3", "Rejected", { emails: ["pat@example.com"] }),
    ];
    expect(decideMatch(donor, { byEmail: people, byPhone: [] }, ctx({ rejected: new Set(["3"]) })).kind).toBe("NO_MATCH");
  });

  it("a person already linked to a DIFFERENT donor goes to review, never a second auto-link", () => {
    const r = decideMatch(donor, { byEmail: [person("1", "Pat Smith", { emails: ["pat@example.com"] })], byPhone: [] }, ctx({ linkedElsewhere: new Map([["1", "donor-other"]]) }));
    expect(r).toMatchObject({ kind: "NEEDS_REVIEW" });
    expect((r as any).candidates[0].alreadyLinkedDonorId).toBe("donor-other");
  });

  it("no one found means no match", () => {
    expect(decideMatch(donor, noPeople, ctx()).kind).toBe("NO_MATCH");
  });
});

describe("resolveDonorLink", () => {
  const client = {} as any;
  beforeEach(() => {
    db.donors = [{ id: "d1", churchId: "c1", name: "Pat Smith", normalizedEmail: "pat@example.com", normalizedPhone: null }];
    db.links = [];
    nextId = 1;
    searchPeopleMock.mockReset();
    getPersonMock.mockReset();
  });

  it("matches, stores the link and returns it", async () => {
    searchPeopleMock.mockResolvedValue([person("p1", "Pat Smith", { emails: ["pat@example.com"] })]);
    expect(await resolveDonorLink("c1", "d1", "org1", client)).toEqual({ status: "LINKED", pcoPersonId: "p1" });
    expect(db.links[0]).toMatchObject({ churchId: "c1", donorId: "d1", status: "LINKED", pcoPersonId: "p1", matchMethod: "EMAIL", pcoOrganizationId: "org1" });
  });

  it("an existing link costs ZERO Planning Center requests", async () => {
    db.links = [{ id: "l1", churchId: "c1", donorId: "d1", pcoOrganizationId: "org1", status: "LINKED", pcoPersonId: "p1", rejectedPcoPersonIds: [], lastCheckedAt: new Date() }];
    expect(await resolveDonorLink("c1", "d1", "org1", client)).toEqual({ status: "LINKED", pcoPersonId: "p1" });
    expect(searchPeopleMock).not.toHaveBeenCalled();
  });

  it("a link made against a different organization is ignored and replaced", async () => {
    db.links = [{ id: "l1", churchId: "c1", donorId: "d1", pcoOrganizationId: "OLD", status: "LINKED", pcoPersonId: "old", rejectedPcoPersonIds: [], lastCheckedAt: new Date() }];
    searchPeopleMock.mockResolvedValue([person("p1", "Pat Smith", { emails: ["pat@example.com"] })]);
    expect(await resolveDonorLink("c1", "d1", "org1", client)).toEqual({ status: "LINKED", pcoPersonId: "p1" });
    expect(db.links).toHaveLength(1);
    expect(db.links[0].pcoOrganizationId).toBe("org1");
  });

  it("caches 'no match' for 24h, re-checks afterwards, and always re-checks when forced", async () => {
    searchPeopleMock.mockResolvedValue([]);
    const t0 = new Date("2026-10-01T00:00:00Z");
    expect((await resolveDonorLink("c1", "d1", "org1", client, { now: t0 })).status).toBe("NO_MATCH");
    expect(searchPeopleMock).toHaveBeenCalledTimes(1);
    await resolveDonorLink("c1", "d1", "org1", client, { now: new Date(t0.getTime() + 3600_000) });
    expect(searchPeopleMock).toHaveBeenCalledTimes(1);
    await resolveDonorLink("c1", "d1", "org1", client, { now: new Date(t0.getTime() + 25 * 3600_000) });
    expect(searchPeopleMock).toHaveBeenCalledTimes(2);
    await resolveDonorLink("c1", "d1", "org1", client, { now: new Date(t0.getTime() + 25 * 3600_000 + 1000), force: true });
    expect(searchPeopleMock).toHaveBeenCalledTimes(3);
  });

  it("NEEDS_REVIEW is left to a human: no new lookup", async () => {
    db.links = [{ id: "l1", churchId: "c1", donorId: "d1", pcoOrganizationId: "org1", status: "NEEDS_REVIEW", pcoPersonId: null, rejectedPcoPersonIds: [], lastCheckedAt: new Date(0) }];
    expect((await resolveDonorLink("c1", "d1", "org1", client)).status).toBe("NEEDS_REVIEW");
    expect(searchPeopleMock).not.toHaveBeenCalled();
  });

  it("two donors can't both auto-link to one person: the second goes to review", async () => {
    db.donors.push({ id: "d2", churchId: "c1", name: "Pat S", normalizedEmail: "pat@example.com", normalizedPhone: null });
    searchPeopleMock.mockResolvedValue([person("p1", "Pat Smith", { emails: ["pat@example.com"] })]);
    await resolveDonorLink("c1", "d1", "org1", client);
    expect((await resolveDonorLink("c1", "d2", "org1", client)).status).toBe("NEEDS_REVIEW");
    expect(db.links.find((l) => l.donorId === "d2")!.candidatesJson[0].alreadyLinkedDonorId).toBe("d1");
  });

  it("only looks at donors in the right church", async () => {
    await expect(resolveDonorLink("other-church", "d1", "org1", client)).rejects.toBeInstanceOf(PlanningCenterSetupError);
    expect(searchPeopleMock).not.toHaveBeenCalled();
  });

  it("a donor with no email or phone is no match without any request", async () => {
    db.donors = [{ id: "d1", churchId: "c1", name: "Pat Smith", normalizedEmail: null, normalizedPhone: null }];
    expect((await resolveDonorLink("c1", "d1", "org1", client)).status).toBe("NO_MATCH");
    expect(searchPeopleMock).not.toHaveBeenCalled();
  });
});

describe("manual link / reject / unlink", () => {
  const client = {} as any;
  const actor = { userId: "u1" };
  beforeEach(() => {
    db.donors = [{ id: "d1", churchId: "c1" }, { id: "d2", churchId: "c1" }];
    db.links = [];
    getPersonMock.mockReset();
  });

  it("links the chosen person and records who did it", async () => {
    getPersonMock.mockResolvedValue(person("p9", "Pat Smith"));
    await linkDonorManually("c1", "d1", "p9", "org1", client, actor);
    expect(db.links[0]).toMatchObject({ donorId: "d1", pcoPersonId: "p9", status: "LINKED", matchMethod: "MANUAL", linkedByUserId: "u1" });
  });

  it("refuses a person who is missing, inactive, or already linked to another donor", async () => {
    getPersonMock.mockResolvedValueOnce(null);
    await expect(linkDonorManually("c1", "d1", "p9", "org1", client, actor)).rejects.toThrow(/no longer exists/);
    getPersonMock.mockResolvedValueOnce(person("p9", "Old", { isInactive: true }));
    await expect(linkDonorManually("c1", "d1", "p9", "org1", client, actor)).rejects.toThrow(/inactive/);
    db.links = [{ id: "l1", churchId: "c1", donorId: "d2", status: "LINKED", pcoPersonId: "p9", rejectedPcoPersonIds: [] }];
    getPersonMock.mockResolvedValueOnce(person("p9", "Pat Smith"));
    await expect(linkDonorManually("c1", "d1", "p9", "org1", client, actor)).rejects.toThrow(/already linked to a different donor/);
  });

  it("reject removes one candidate, keeps review open while others remain, then falls back to no match", async () => {
    db.links = [{ id: "l1", churchId: "c1", donorId: "d1", status: "NEEDS_REVIEW", pcoPersonId: null, rejectedPcoPersonIds: [], candidatesJson: [{ pcoPersonId: "a" }, { pcoPersonId: "b" }] }];
    await rejectCandidate("c1", "d1", "a", actor);
    expect(db.links[0]).toMatchObject({ status: "NEEDS_REVIEW", rejectedPcoPersonIds: ["a"] });
    expect(db.links[0].candidatesJson).toEqual([{ pcoPersonId: "b" }]);
    await rejectCandidate("c1", "d1", "b", actor);
    expect(db.links[0]).toMatchObject({ status: "NO_MATCH", rejectedPcoPersonIds: ["a", "b"] });
  });

  it("unlink clears the link and remembers the person as rejected so it can't silently come back", async () => {
    db.links = [{ id: "l1", churchId: "c1", donorId: "d1", status: "LINKED", pcoPersonId: "p1", rejectedPcoPersonIds: [] }];
    await unlinkDonor("c1", "d1", actor);
    expect(db.links[0]).toMatchObject({ status: "NO_MATCH", pcoPersonId: null, rejectedPcoPersonIds: ["p1"] });
    await expect(unlinkDonor("c1", "d1", actor)).rejects.toThrow(/isn't linked/);
  });
});

describe("moveLinkOnDonorMerge", () => {
  beforeEach(() => {
    db.links = [];
  });

  it("moves the archived donor's link to the survivor when the survivor has none", async () => {
    db.links = [{ id: "l1", churchId: "c1", donorId: "dup", status: "LINKED", pcoPersonId: "p1" }];
    await moveLinkOnDonorMerge("c1", "dup", "primary");
    expect(db.links[0].donorId).toBe("primary");
  });

  it("replaces a survivor's non-confirmed link", async () => {
    db.links = [
      { id: "l1", churchId: "c1", donorId: "dup", status: "LINKED", pcoPersonId: "p1" },
      { id: "l2", churchId: "c1", donorId: "primary", status: "NO_MATCH", pcoPersonId: null },
    ];
    await moveLinkOnDonorMerge("c1", "dup", "primary");
    expect(db.links).toHaveLength(1);
    expect(db.links[0]).toMatchObject({ id: "l1", donorId: "primary" });
  });

  it("keeps the survivor's confirmed link when both are linked", async () => {
    db.links = [
      { id: "l1", churchId: "c1", donorId: "dup", status: "LINKED", pcoPersonId: "p1" },
      { id: "l2", churchId: "c1", donorId: "primary", status: "LINKED", pcoPersonId: "p2" },
    ];
    await moveLinkOnDonorMerge("c1", "dup", "primary");
    expect(db.links.find((l) => l.id === "l2")!.donorId).toBe("primary");
    expect(db.links.find((l) => l.id === "l1")!.donorId).toBe("dup");
  });

  it("never throws, so it can never break a merge", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = (await import("@/lib/prisma")).prisma as any;
    const original = broken.planningCenterPersonLink.findUnique;
    broken.planningCenterPersonLink.findUnique = async () => { throw new Error("db down"); };
    await expect(moveLinkOnDonorMerge("c1", "dup", "primary")).resolves.toBeUndefined();
    broken.planningCenterPersonLink.findUnique = original;
    errSpy.mockRestore();
  });
});
