/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { records: [] as Row[], payments: [] as Row[], donors: [] as Row[], connection: null as Row | null };
const match = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]: any) => (v && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : v && typeof v === "object" && "not" in v ? row[k] !== v.not : row[k] === v));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterConnection: { findUnique: async () => db.connection },
    planningCenterDonationRecord: {
      findMany: async ({ where, take }: any) => db.records.filter((r) => match(r, where)).slice(0, take),
      update: async ({ where, data }: any) => Object.assign(db.records.find((r) => r.id === where.id)!, data),
    },
    payment: { findMany: async ({ where }: any) => db.payments.filter((p) => p.churchId === where.churchId && where.id.in.includes(p.id)) },
    donor: { findMany: async ({ where }: any) => db.donors.filter((d) => d.churchId === where.churchId && where.id.in.includes(d.id)) },
  },
}));
vi.mock("../service", () => ({ getClientForChurch: async () => ({}) }));
const states = new Map<string, any>();
vi.mock("../personMatching", () => ({ resolveDonorLink: async (_c: string, donorId: string) => states.get(donorId) ?? { status: "NO_MATCH", pcoPersonId: null } }));
const patch = vi.fn();
const read = vi.fn();
vi.mock("../givingApi", () => ({ updateDonationPerson: (...a: unknown[]) => patch(...a), getDonation: (...a: unknown[]) => read(...a) }));

import { PlanningCenterApiError } from "../errors";
import { attachPendingPeople } from "../syncAttach";

const rec = (n: number, over: Row = {}) => ({ id: `r${n}`, churchId: "c1", paymentId: `p${n}`, status: "CREATED", attachPersonPending: true, pcoDonationId: `pd${n}`, updatedAt: new Date(n), ...over });

beforeEach(() => {
  patch.mockReset(); read.mockReset(); states.clear();
  db.connection = { status: "CONNECTED", pcoOrganizationId: "org1" };
  db.records = [rec(1)];
  db.payments = [{ id: "p1", churchId: "c1", donorId: "d1", isAnonymous: false }];
  db.donors = [{ id: "d1", churchId: "c1", anonymousPreference: false }];
  states.set("d1", { status: "LINKED", pcoPersonId: "person1" });
  patch.mockResolvedValue(undefined);
  read.mockResolvedValue({ id: "pd1", personId: "person1" });
});

describe("attachPendingPeople", () => {
  it("attaches the matched person, confirms it by reading the donation back, and clears the flag", async () => {
    expect(await attachPendingPeople("c1", { client: {} as any })).toMatchObject({ attached: 1, waiting: 0 });
    expect(patch).toHaveBeenCalledWith(expect.anything(), "pd1", "person1");
    expect(db.records[0]).toMatchObject({ attachPersonPending: false, pcoPersonId: "person1" });
  });

  it("does nothing while the donor still has no matched person (the gift is already in Planning Center)", async () => {
    for (const status of ["NO_MATCH", "NEEDS_REVIEW"]) {
      states.set("d1", { status, pcoPersonId: null });
      expect(await attachPendingPeople("c1", { client: {} as any })).toMatchObject({ attached: 0, waiting: 1 });
    }
    expect(patch).not.toHaveBeenCalled();
    expect(db.records[0].attachPersonPending).toBe(true);
  });

  it("NEVER names a donor who asked to be anonymous, or an anonymous gift, and makes no Planning Center call", async () => {
    db.donors[0].anonymousPreference = true;
    expect(await attachPendingPeople("c1", { client: {} as any })).toMatchObject({ cleared: 1, attached: 0 });
    expect(patch).not.toHaveBeenCalled();
    expect(db.records[0].attachPersonPending).toBe(false);

    db.records = [rec(1)];
    db.donors[0].anonymousPreference = false;
    db.payments[0].isAnonymous = true;
    expect(await attachPendingPeople("c1", { client: {} as any })).toMatchObject({ cleared: 1 });
    expect(patch).not.toHaveBeenCalled();
  });

  it("only clears the flag once the change is CONFIRMED; otherwise it tries again later", async () => {
    read.mockResolvedValue({ id: "pd1", personId: null });
    expect(await attachPendingPeople("c1", { client: {} as any })).toMatchObject({ attached: 0, waiting: 1 });
    expect(db.records[0].attachPersonPending).toBe(true);
  });

  it("a gift that has vanished from Planning Center is flagged for a person, not silently dropped", async () => {
    read.mockResolvedValue(null);
    expect(await attachPendingPeople("c1", { client: {} as any })).toMatchObject({ flagged: 1 });
    expect(db.records[0]).toMatchObject({ status: "NEEDS_REVIEW", attachPersonPending: false });
  });

  it("only looks at this church's sent gifts that are waiting, and does nothing when not connected", async () => {
    db.records = [rec(1, { churchId: "c2" }), rec(2, { attachPersonPending: false }), rec(3, { status: "HELD" }), rec(4, { pcoDonationId: null })];
    expect(await attachPendingPeople("c1", { client: {} as any })).toEqual({ attached: 0, cleared: 0, waiting: 0, flagged: 0 });
    db.records = [rec(1)];
    db.connection = { status: "DISCONNECTED" };
    expect(await attachPendingPeople("c1", { client: {} as any })).toMatchObject({ attached: 0 });
    expect(patch).not.toHaveBeenCalled();
  });

  it("stops at once on a sign-in or rate-limit problem, but one bad gift doesn't stop the others", async () => {
    db.records = [rec(1), rec(2)];
    db.payments.push({ id: "p2", churchId: "c1", donorId: "d1", isAnonymous: false });
    patch.mockRejectedValueOnce(new PlanningCenterApiError({ category: "RATE_LIMITED", retryable: true, safeMessage: "x" }, 429));
    await attachPendingPeople("c1", { client: {} as any });
    expect(patch).toHaveBeenCalledTimes(1); // stopped

    patch.mockReset();
    patch.mockRejectedValueOnce(new Error("weird")).mockResolvedValue(undefined);
    read.mockResolvedValue({ id: "x", personId: "person1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await attachPendingPeople("c1", { client: {} as any })).toMatchObject({ attached: 1, waiting: 1 });
  });
});
