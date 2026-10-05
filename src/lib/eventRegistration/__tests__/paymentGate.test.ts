/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory prisma fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

let registration: Record<string, any> | null;
let event: Record<string, any> | null;
let attempt: Record<string, any> | null;
const regFindFirst = vi.fn();
const eventFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventRegistration: { findFirst: (a: unknown) => (regFindFirst(a), Promise.resolve(registration)) },
    event: { findFirst: (a: unknown) => (eventFindFirst(a), Promise.resolve(event)) },
    paymentAttempt: { findUnique: () => Promise.resolve(attempt) },
    eventRegistrationAddOn: { findMany: () => Promise.resolve([{ addOnId: "ao1", unitPriceCents: 1000, quantity: 2 }]) },
    eventAddOn: { findMany: () => Promise.resolve([{ id: "ao1", fmvCents: 400 }]) },
  },
}));

import { gateEventPayment } from "@/lib/eventRegistration/paymentGate";

const params = { registrationId: "reg1", churchId: "church1", givingLinkId: "link1", clientAttemptId: "att1", isRecurring: false, donationAmountCents: 12000 };

beforeEach(() => {
  regFindFirst.mockClear();
  eventFindFirst.mockClear();
  registration = { id: "reg1", churchId: "church1", eventId: "ev1", status: "PENDING", paymentId: null, totalCents: 12000, attendeeCount: 2 };
  event = { id: "ev1", name: "Spring Event", givingLinkId: "link1", priceCents: 5000, priceMode: "PER_ATTENDEE", registrationFmvCents: 3000 };
  attempt = null;
});

describe("gateEventPayment", () => {
  it("accepts a pending registration paid on its own event link for exactly its total, and computes the benefit value", async () => {
    const g = await gateEventPayment(params);
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.ctx).toEqual({ registrationId: "reg1", eventName: "Spring Event", benefitValueCents: 2 * 3000 + 2 * 400 });
  });

  it("always looks the registration and event up scoped to the church", async () => {
    await gateEventPayment(params);
    expect(regFindFirst).toHaveBeenCalledWith({ where: { id: "reg1", churchId: "church1" } });
    expect(eventFindFirst).toHaveBeenCalledWith({ where: { id: "ev1", churchId: "church1" } });
  });

  it("404s for a registration that doesn't exist for this church (cross-tenant ids look the same as unknown ones)", async () => {
    registration = null;
    expect(await gateEventPayment(params)).toMatchObject({ ok: false, status: 404 });
  });

  it("rejects a payment made through a giving link that isn't the event's own", async () => {
    expect(await gateEventPayment({ ...params, givingLinkId: "someOtherLink" })).toMatchObject({ ok: false, status: 404 });
  });

  it("rejects an amount that differs from the registration total (tampered or stale)", async () => {
    expect(await gateEventPayment({ ...params, donationAmountCents: 100 })).toMatchObject({ ok: false, status: 400, retryable: true });
    expect(await gateEventPayment({ ...params, donationAmountCents: 99999 })).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects recurring payments", async () => {
    expect(await gateEventPayment({ ...params, isRecurring: true })).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects an already-paid or already-confirmed registration", async () => {
    registration = { ...registration!, status: "CONFIRMED" };
    expect(await gateEventPayment(params)).toMatchObject({ ok: false, status: 409 });
    registration = { ...registration, status: "PENDING", paymentId: "pay1" };
    expect(await gateEventPayment(params)).toMatchObject({ ok: false, status: 409 });
  });

  it("treats a retry of the same already-successful attempt as the original success, not an error", async () => {
    registration = { ...registration!, status: "CONFIRMED", paymentId: "pay1" };
    attempt = { status: "SUCCEEDED", finixTransferId: "TR123" };
    expect(await gateEventPayment(params)).toEqual({ ok: false, duplicate: { transferId: "TR123", state: "SUCCEEDED" } });
  });
});
