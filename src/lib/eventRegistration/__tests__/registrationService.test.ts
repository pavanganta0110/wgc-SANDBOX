/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory prisma fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the handful of tables the service touches, so the
// tests exercise the real validation/pricing/idempotency logic end to end.
interface Store {
  event: Record<string, unknown> | null;
  addOns: Record<string, unknown>[];
  registrations: Record<string, any>[];
  attendees: Record<string, any>[];
  addOnLines: Record<string, any>[];
  donors: Record<string, any>[];
}
let store: Store;
let idSeq = 0;
const finixTouched = vi.fn();
const resolveDonor = vi.fn();
const sendConfirmation = vi.fn();
const assertApproved = vi.fn();

function whereMatches(row: Record<string, any>, where: Record<string, any>): boolean {
  return Object.entries(where).every(([k, v]) => (v && typeof v === "object" && !(v instanceof Date) ? true : row[k] === v));
}

vi.mock("@/lib/prisma", () => {
  const tx = {
    eventAttendee: {
      deleteMany: async ({ where }: any) => {
        store.attendees = store.attendees.filter((a) => a.registrationId !== where.registrationId);
      },
      createMany: async ({ data }: any) => {
        for (const d of data) store.attendees.push({ id: `att${++idSeq}`, checkedIn: false, donorId: null, ...d });
      },
    },
    eventRegistrationAddOn: {
      deleteMany: async ({ where }: any) => {
        store.addOnLines = store.addOnLines.filter((l) => l.registrationId !== where.registrationId);
      },
      createMany: async ({ data }: any) => {
        for (const d of data) store.addOnLines.push({ id: `line${++idSeq}`, ...d });
      },
    },
    eventRegistration: {
      create: async ({ data }: any) => {
        const row = { id: `reg${++idSeq}`, paymentId: null, donorId: null, createdAt: new Date(), ...data };
        store.registrations.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = store.registrations.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  };
  return {
    prisma: {
      event: { findUnique: async () => store.event },
      eventAddOn: { findMany: async () => store.addOns },
      givingLink: { findFirst: async () => ({ id: "link1", publicSlug: "linkslug" }) },
      church: { findUnique: async () => ({ finixMerchantId: "MU123" }) },
      donor: { findMany: async () => store.donors },
      eventAttendee: {
        findMany: async ({ where }: any) => store.attendees.filter((a) => a.registrationId === where.registrationId && (where.donorId === null ? a.donorId === null : true)),
        update: async ({ where, data }: any) => Object.assign(store.attendees.find((a) => a.id === where.id)!, data),
        updateMany: async ({ where, data }: any) => {
          const rows = store.attendees.filter((a) => a.registrationId === where.registrationId && (where.checkedIn === undefined || a.checkedIn === where.checkedIn));
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        },
      },
      eventRegistration: {
        findUnique: async ({ where }: any) => {
          if (where.eventId_clientKey) {
            return store.registrations.find((r) => r.eventId === where.eventId_clientKey.eventId && r.clientKey === where.eventId_clientKey.clientKey) ?? null;
          }
          return store.registrations.find((r) => r.id === where.id) ?? null;
        },
        updateMany: async ({ where, data }: any) => {
          const rows = store.registrations.filter((r) => whereMatches(r, where));
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        },
        update: async ({ where, data }: any) => Object.assign(store.registrations.find((r) => r.id === where.id)!, data),
      },
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
    },
  };
});
vi.mock("@/lib/donors/resolveOrCreateDonor", () => ({ resolveOrCreateDonor: (...a: unknown[]) => resolveDonor(...a) }));
vi.mock("@/lib/eventRegistration/eventEmails", () => ({ sendRegistrationConfirmationEmail: (...a: unknown[]) => sendConfirmation(...a) }));
vi.mock("@/lib/onboarding/nonprofitVerificationGuard", () => ({ assertNonprofitApproved: (...a: unknown[]) => assertApproved(...a) }));
// Any attempt to reach Finix from registration code is a bug.
vi.mock("@/lib/finix/client", () => ({ finixRequest: (...a: unknown[]) => finixTouched(...a) }));

import { submitEventRegistration, finalizeEventRegistration } from "@/lib/eventRegistration/registrationService";

const NOW = new Date("2030-04-01T12:00:00Z");

function baseEvent(over: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    churchId: "church1",
    slug: "spring",
    name: "Spring Event",
    status: "ACTIVE",
    archivedAt: null,
    startsAt: new Date("2030-05-02T23:00:00Z"),
    endsAt: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    priceCents: 0,
    priceMode: "PER_ATTENDEE",
    registrationFmvCents: null,
    allowOptionalDonation: false,
    allowMultipleAttendees: true,
    maxAttendeesPerRegistration: 5,
    attendeeEmailRequired: false,
    collectAttendeePhone: false,
    registrantPhoneRequired: false,
    allowGroups: true,
    groupLabel: "Team",
    groupRequired: false,
    mailingAddressMode: "HIDDEN",
    customFieldsJson: [
      { id: "shirt", label: "Shirt", type: "DROPDOWN", required: true, appliesTo: "ATTENDEE", options: ["S", "M"] },
      { id: "waiver", label: "Waiver", type: "CHECKBOX", required: true, appliesTo: "REGISTRATION" },
    ],
    givingLinkId: "link1",
    ...over,
  };
}

function input(over: Record<string, unknown> = {}) {
  return {
    clientKey: "key-1",
    registrant: { firstName: "Pat", lastName: "Lee", email: "pat@example.com" },
    attendees: [
      { firstName: "Pat", lastName: "Lee", email: "pat@example.com", customResponses: { shirt: "M" } },
      { firstName: "Jo", lastName: "Lee", customResponses: { shirt: "S" } },
    ],
    groupName: "Team Rocket",
    customResponses: { waiver: true },
    ...over,
  } as Parameters<typeof submitEventRegistration>[1];
}

beforeEach(() => {
  idSeq = 0;
  store = { event: baseEvent(), addOns: [], registrations: [], attendees: [], addOnLines: [], donors: [] };
  finixTouched.mockReset();
  resolveDonor.mockReset().mockResolvedValue({ id: "donor1", created: true, updated: false });
  sendConfirmation.mockReset().mockResolvedValue(true);
  assertApproved.mockReset().mockResolvedValue(undefined);
});

describe("free registration", () => {
  it("confirms immediately, never touches Finix or the giving link, and emails a confirmation", async () => {
    const r = await submitEventRegistration("spring", input(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("CONFIRMED");
    expect(r.requiresPayment).toBe(false);
    expect(r.givingLinkSlug).toBeNull();
    expect(r.totals.totalCents).toBe(0);
    expect(finixTouched).not.toHaveBeenCalled();
    expect(assertApproved).not.toHaveBeenCalled();
    expect(sendConfirmation).toHaveBeenCalledTimes(1);
    expect(store.registrations[0]).toMatchObject({ status: "CONFIRMED", paymentId: null, donorId: "donor1" });
  });

  it("creates the registrant as a contact tagged EVENT without a payment", async () => {
    await submitEventRegistration("spring", input(), NOW);
    expect(resolveDonor).toHaveBeenCalledWith(expect.objectContaining({ churchId: "church1", email: "pat@example.com", contactSource: "EVENT" }));
  });
});

describe("multiple attendees", () => {
  it("stores every attendee as its own row with their own answers and the registration's group", async () => {
    const r = await submitEventRegistration("spring", input(), NOW);
    expect(r.ok).toBe(true);
    expect(store.attendees).toHaveLength(2);
    expect(store.attendees.map((a) => a.firstName)).toEqual(["Pat", "Jo"]);
    expect(store.attendees[0].customResponsesJson).toEqual({ shirt: "M" });
    expect(store.attendees[1].customResponsesJson).toEqual({ shirt: "S" });
    expect(store.attendees.every((a) => a.churchId === "church1" && a.eventId === "ev1")).toBe(true);
    expect(store.registrations[0]).toMatchObject({ attendeeCount: 2, groupName: "Team Rocket", customResponsesJson: { waiver: true } });
  });

  it("enforces the per-registration maximum and requires at least one attendee", async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ firstName: `A${i}`, lastName: "X", customResponses: { shirt: "S" } }));
    expect((await submitEventRegistration("spring", input({ attendees: six }), NOW)).ok).toBe(false);
    expect((await submitEventRegistration("spring", input({ attendees: [] }), NOW)).ok).toBe(false);
  });

  it("allows only one attendee when multiple are turned off", async () => {
    store.event = baseEvent({ allowMultipleAttendees: false, maxAttendeesPerRegistration: 1 });
    expect((await submitEventRegistration("spring", input(), NOW)).ok).toBe(false);
  });

  it("requires required custom answers per attendee and for the registration", async () => {
    const missingShirt = input({ attendees: [{ firstName: "Pat", lastName: "Lee", customResponses: {} }] });
    const r1 = await submitEventRegistration("spring", missingShirt, NOW);
    expect(r1.ok).toBe(false);
    const r2 = await submitEventRegistration("spring", input({ customResponses: {} }), NOW);
    expect(r2.ok).toBe(false);
  });
});

describe("paid registration", () => {
  beforeEach(() => {
    store.event = baseEvent({ priceCents: 5000, allowOptionalDonation: true });
    store.addOns = [{ id: "ao1", name: "Raffle", priceCents: 1000, fmvCents: null, maxQuantity: 5, isActive: true }];
  });

  it("stays PENDING (unpaid carts never count), prices everything server-side, and hands back the dedicated giving link", async () => {
    const r = await submitEventRegistration("spring", input({ addOns: [{ addOnId: "ao1", quantity: 2 }], donationCents: 500 }), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("PENDING");
    expect(r.requiresPayment).toBe(true);
    expect(r.givingLinkSlug).toBe("linkslug");
    expect(r.totals).toMatchObject({ registrationAmountCents: 10000, addOnsAmountCents: 2000, donationAmountCents: 500, totalCents: 12500 });
    expect(store.registrations[0]).toMatchObject({ status: "PENDING", totalCents: 12500, paymentId: null });
    expect(store.addOnLines[0]).toMatchObject({ addOnId: "ao1", nameSnapshot: "Raffle", quantity: 2, lineTotalCents: 2000 });
    expect(sendConfirmation).not.toHaveBeenCalled();
    expect(resolveDonor).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied total — there is no field for one", async () => {
    const tampered = { ...input(), totalCents: 1, priceCents: 1 } as unknown as Parameters<typeof submitEventRegistration>[1];
    const r = await submitEventRegistration("spring", tampered, NOW);
    expect(r.ok && r.totals.totalCents).toBe(10000);
  });

  it("refuses when the organization has no payment account or is not approved", async () => {
    assertApproved.mockRejectedValueOnce(new Error("not approved"));
    const r = await submitEventRegistration("spring", input(), NOW);
    expect(r.ok).toBe(false);
  });

  it("rewrites a pending cart in place when the same client key resubmits (no duplicate registrations or attendees)", async () => {
    await submitEventRegistration("spring", input(), NOW);
    const second = await submitEventRegistration("spring", input({ attendees: [{ firstName: "Pat", lastName: "Lee", customResponses: { shirt: "M" } }] }), NOW);
    expect(second.ok).toBe(true);
    expect(store.registrations).toHaveLength(1);
    expect(store.attendees).toHaveLength(1);
    expect(store.registrations[0].totalCents).toBe(5000);
  });

  it("refuses to rewrite a cart that already has a payment in progress", async () => {
    await submitEventRegistration("spring", input(), NOW);
    store.registrations[0].paymentId = "pay1";
    const r = await submitEventRegistration("spring", input(), NOW);
    expect(r.ok).toBe(false);
  });
});

describe("closed events", () => {
  it("rejects unknown, draft, closed and finished events", async () => {
    store.event = null;
    expect((await submitEventRegistration("nope", input(), NOW)).ok).toBe(false);
    store.event = baseEvent({ status: "DRAFT" });
    expect((await submitEventRegistration("spring", input(), NOW)).ok).toBe(false);
    store.event = baseEvent({ registrationClosesAt: new Date("2030-03-01T00:00:00Z") });
    expect((await submitEventRegistration("spring", input(), NOW)).ok).toBe(false);
    store.event = baseEvent();
    expect((await submitEventRegistration("spring", input(), new Date("2030-06-01T00:00:00Z"))).ok).toBe(false);
  });
});

describe("duplicate submission of a confirmed free registration", () => {
  it("returns the original instead of creating a second one or sending a second email", async () => {
    const first = await submitEventRegistration("spring", input(), NOW);
    const again = await submitEventRegistration("spring", input(), NOW);
    expect(first.ok && again.ok && again.duplicate).toBe(true);
    expect(store.registrations).toHaveLength(1);
    expect(sendConfirmation).toHaveBeenCalledTimes(1);
  });
});

describe("finalizeEventRegistration", () => {
  it("is idempotent: a second finalize does not re-confirm or re-email", async () => {
    store.event = baseEvent({ priceCents: 5000 });
    const r = await submitEventRegistration("spring", input(), NOW);
    if (!r.ok) throw new Error("setup failed");
    await finalizeEventRegistration(r.registrationId, { donorId: "donorX", paymentId: "pay1", paidAt: NOW });
    await finalizeEventRegistration(r.registrationId, { donorId: "donorX", paymentId: "pay1", paidAt: NOW });
    expect(sendConfirmation).toHaveBeenCalledTimes(1);
    expect(store.registrations[0]).toMatchObject({ status: "CONFIRMED", paymentId: "pay1", donorId: "donorX" });
    expect(resolveDonor).not.toHaveBeenCalled(); // the payment flow already resolved the donor
  });

  it("links attendees to existing donors by email without creating new donor rows", async () => {
    store.donors = [{ id: "dExisting", normalizedEmail: "pat@example.com" }];
    const r = await submitEventRegistration("spring", input(), NOW);
    if (!r.ok) throw new Error("setup failed");
    expect(store.attendees.find((a) => a.firstName === "Pat")?.donorId).toBe("dExisting");
    expect(store.attendees.find((a) => a.firstName === "Jo")?.donorId).toBeNull();
    expect(resolveDonor).toHaveBeenCalledTimes(1); // registrant only — never one per attendee
  });

  it("does nothing for a canceled registration", async () => {
    store.event = baseEvent({ priceCents: 5000 });
    const r = await submitEventRegistration("spring", input(), NOW);
    if (!r.ok) throw new Error("setup failed");
    store.registrations[0].status = "CANCELED";
    await finalizeEventRegistration(r.registrationId, { paymentId: "pay1" });
    expect(store.registrations[0].status).toBe("CANCELED");
    expect(sendConfirmation).not.toHaveBeenCalled();
  });
});


describe("door sales", () => {
  const DOOR = { userId: "staff1" };
  // Mid-event, after the online sign-up deadline has passed.
  const DURING = new Date("2030-05-02T23:30:00Z");
  const paidEvent = (over: Record<string, unknown> = {}) =>
    baseEvent({ priceCents: 2500, registrationClosesAt: new Date("2030-05-01T00:00:00Z"), endsAt: new Date("2030-05-03T02:00:00Z"), ...over });

  it("rejects an online registration past the deadline but accepts a door sale", async () => {
    store.event = paidEvent();
    expect((await submitEventRegistration("spring", input(), DURING)).ok).toBe(false);
    const r = await submitEventRegistration("spring", input(), DURING, { ...DOOR, paymentMethod: "CASH" });
    expect(r.ok).toBe(true);
  });

  it("records a cash sale as confirmed + paid in hand, checked in, with no Finix and no giving link", async () => {
    store.event = paidEvent({ givingLinkId: null });
    const r = await submitEventRegistration("spring", input(), DURING, { ...DOOR, paymentMethod: "CASH" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("CONFIRMED");
    expect(r.requiresPayment).toBe(false);
    expect(r.totals.totalCents).toBe(5000); // 2 attendees x $25, recomputed server-side
    expect(finixTouched).not.toHaveBeenCalled();
    expect(assertApproved).not.toHaveBeenCalled();
    expect(store.registrations[0]).toMatchObject({ status: "CONFIRMED", paymentMethod: "CASH", soldAtDoor: true, soldByUserId: "staff1", paymentId: null, totalCents: 5000 });
    expect(store.registrations[0].paidAt).toEqual(DURING);
    expect(store.attendees).toHaveLength(2);
    expect(store.attendees.every((a) => a.checkedIn && a.checkedInByUserId === "staff1")).toBe(true);
    expect(sendConfirmation).toHaveBeenCalledTimes(1);
  });

  it("gives every attendee a unique ticket token", async () => {
    await submitEventRegistration("spring", input({ clientKey: "k-a" }), NOW);
    await submitEventRegistration("spring", input({ clientKey: "k-b" }), NOW);
    const tokens = store.attendees.map((a) => a.ticketToken);
    expect(tokens).toHaveLength(4);
    expect(tokens.every((t) => typeof t === "string" && t.length >= 20)).toBe(true);
    expect(new Set(tokens).size).toBe(4);
  });

  it("zeroes a complimentary ticket", async () => {
    store.event = paidEvent();
    const r = await submitEventRegistration("spring", input(), DURING, { ...DOOR, paymentMethod: "COMPLIMENTARY" });
    expect(r.ok).toBe(true);
    expect(store.registrations[0]).toMatchObject({ paymentMethod: "COMPLIMENTARY", totalCents: 0, registrationAmountCents: 0 });
    expect(store.registrations[0].paidAt).toBeNull();
  });

  it("leaves a door CARD sale pending until paid, then confirms and checks the buyer in", async () => {
    store.event = paidEvent();
    const r = await submitEventRegistration("spring", input(), DURING, DOOR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("PENDING");
    expect(r.requiresPayment).toBe(true);
    expect(store.attendees.every((a) => !a.checkedIn)).toBe(true);
    expect(store.registrations[0]).toMatchObject({ soldAtDoor: true, paymentMethod: null });

    await finalizeEventRegistration(r.registrationId, { paymentId: "pay1", paidAt: DURING });
    expect(store.registrations[0].status).toBe("CONFIRMED");
    expect(store.attendees.every((a) => a.checkedIn)).toBe(true);
  });

  it("doesn't require each guest's own email at the door, but still does online", async () => {
    store.event = paidEvent({ attendeeEmailRequired: true });
    const guests = input({ attendees: [{ firstName: "Pat", lastName: "Lee", customResponses: { shirt: "M" } }, { firstName: "Jo", lastName: "Lee", customResponses: { shirt: "S" } }] });
    expect((await submitEventRegistration("spring", guests, NOW)).ok).toBe(false);
    expect((await submitEventRegistration("spring", guests, DURING, { ...DOOR, paymentMethod: "CASH" })).ok).toBe(true);
  });

  it("does not check in an ordinary online registration", async () => {
    await submitEventRegistration("spring", input(), NOW);
    expect(store.attendees.every((a) => !a.checkedIn)).toBe(true);
    expect(store.registrations[0].soldAtDoor).toBeFalsy();
  });

  it("refuses a door sale once the event is over or isn't published", async () => {
    store.event = paidEvent();
    const late = new Date("2030-05-03T03:00:00Z");
    expect((await submitEventRegistration("spring", input(), late, { ...DOOR, paymentMethod: "CASH" })).ok).toBe(false);
    store.event = paidEvent({ status: "DRAFT" });
    expect((await submitEventRegistration("spring", input(), DURING, { ...DOOR, paymentMethod: "CASH" })).ok).toBe(false);
  });
});
