import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, finixMock, emitEventMock } = vi.hoisted(() => ({
  prismaMock: {
    donor: { findFirst: vi.fn(), findMany: vi.fn() },
    finixSubscription: { findFirst: vi.fn(), update: vi.fn() },
    finixPaymentInstrumentSnapshot: { findFirst: vi.fn() },
    subscriptionAction: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    subscriptionSetupLink: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
  finixMock: { updateSubscription: vi.fn(), cancelSubscription: vi.fn() },
  emitEventMock: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/finix/client", () => ({ finixClient: finixMock }));
vi.mock("@/lib/events/emitEvent", () => ({ emitEvent: emitEventMock }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { Prisma } from "@prisma/client";
import { donorUpdateSubscriptionAmount, donorCancelSubscription, createDonorPaymentUpdateSetupUrl, DonorSubscriptionError } from "../donorSubscriptions";

const ctx = { churchId: "church1", sessionDonorId: "d1", subscriptionId: "sub1", idempotencyKey: "key-1" };
const sub = {
  id: "sub1", churchId: "church1", donorId: "d1", finixSubscriptionId: "subscription_X", state: "ACTIVE", canceledAt: null, completedAt: null,
  amountCents: 5000, donationAmountCents: 5000, donorCoversFee: false, isPledge: false, finixPaymentInstrumentId: "PI1", billingInterval: "MONTHLY", fundId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.donor.findFirst.mockResolvedValue({ id: "d1", email: "ann@example.com" });
  prismaMock.donor.findMany.mockResolvedValue([{ id: "d1", name: "Ann", email: "ann@example.com", normalizedEmail: "ann@example.com" }]);
  prismaMock.finixSubscription.findFirst.mockResolvedValue(sub);
  prismaMock.finixPaymentInstrumentSnapshot.findFirst.mockResolvedValue({ paymentMethodType: "card", cardBrand: "VISA" });
  prismaMock.subscriptionAction.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  finixMock.updateSubscription.mockResolvedValue({});
  finixMock.cancelSubscription.mockResolvedValue({});
});

describe("ownership", () => {
  it("looks the subscription up scoped to the church and the donor's own records", async () => {
    await donorUpdateSubscriptionAmount(ctx, 7500);
    expect(prismaMock.finixSubscription.findFirst.mock.calls[0][0].where).toEqual({ id: "sub1", churchId: "church1", donorId: { in: ["d1"] } });
  });

  it("treats someone else's subscription as not found and never calls Finix", async () => {
    prismaMock.finixSubscription.findFirst.mockResolvedValue(null);
    await expect(donorUpdateSubscriptionAmount(ctx, 7500)).rejects.toMatchObject({ status: 404 });
    await expect(donorCancelSubscription(ctx)).rejects.toMatchObject({ status: 404 });
    await expect(createDonorPaymentUpdateSetupUrl(ctx)).rejects.toMatchObject({ status: 404 });
    expect(finixMock.updateSubscription).not.toHaveBeenCalled();
    expect(finixMock.cancelSubscription).not.toHaveBeenCalled();
  });
});

describe("donorUpdateSubscriptionAmount", () => {
  it("updates Finix in place first, then records the new amount", async () => {
    const result = await donorUpdateSubscriptionAmount(ctx, 7500);
    expect(finixMock.updateSubscription).toHaveBeenCalledWith("subscription_X", { amount: 7500 });
    expect(prismaMock.finixSubscription.update.mock.calls[0][0].data).toMatchObject({ amountCents: 7500, donationAmountCents: 7500 });
    expect(result).toMatchObject({ amountCents: 7500 });
  });

  it("adds the fee back when the donor covers it", async () => {
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ ...sub, donorCoversFee: true, amountCents: 5180, donationAmountCents: 5000 });
    const result = (await donorUpdateSubscriptionAmount(ctx, 10000)) as { amountCents: number; donationAmountCents: number };
    expect(result.donationAmountCents).toBe(10000);
    expect(result.amountCents).toBeGreaterThan(10000);
    expect(finixMock.updateSubscription).toHaveBeenCalledWith("subscription_X", { amount: result.amountCents });
  });

  it("leaves the database amount untouched when Finix rejects the update", async () => {
    finixMock.updateSubscription.mockRejectedValue(new Error("boom"));
    await expect(donorUpdateSubscriptionAmount(ctx, 7500)).rejects.toMatchObject({ status: 502 });
    expect(prismaMock.finixSubscription.update).not.toHaveBeenCalled();
    expect(prismaMock.subscriptionAction.update.mock.calls[0][0].data.state).toBe("FAILED");
  });

  it("replays a completed request without calling Finix again", async () => {
    prismaMock.subscriptionAction.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    prismaMock.subscriptionAction.findUnique.mockResolvedValue({ churchId: "church1", finixSubscriptionId: "subscription_X", actionType: "UPDATE_AMOUNT", state: "COMPLETED", newValue: { amountCents: 7500 } });
    expect(await donorUpdateSubscriptionAmount(ctx, 7500)).toEqual({ amountCents: 7500 });
    expect(finixMock.updateSubscription).not.toHaveBeenCalled();
  });

  it("lets the donor retry the same key after a failed attempt", async () => {
    prismaMock.subscriptionAction.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    prismaMock.subscriptionAction.findUnique.mockResolvedValue({ churchId: "church1", finixSubscriptionId: "subscription_X", actionType: "UPDATE_AMOUNT", state: "FAILED" });
    prismaMock.subscriptionAction.updateMany.mockResolvedValue({ count: 1 });
    await donorUpdateSubscriptionAmount(ctx, 7500);
    expect(prismaMock.subscriptionAction.updateMany.mock.calls[0][0].where).toEqual({ idempotencyKey: "key-1", state: "FAILED" });
    expect(finixMock.updateSubscription).toHaveBeenCalledTimes(1);
  });

  it("does not run twice when two retries race for the same failed key", async () => {
    prismaMock.subscriptionAction.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    prismaMock.subscriptionAction.findUnique.mockResolvedValue({ churchId: "church1", finixSubscriptionId: "subscription_X", actionType: "UPDATE_AMOUNT", state: "FAILED" });
    prismaMock.subscriptionAction.updateMany.mockResolvedValue({ count: 0 });
    await expect(donorUpdateSubscriptionAmount(ctx, 7500)).rejects.toMatchObject({ status: 409 });
    expect(finixMock.updateSubscription).not.toHaveBeenCalled();
  });

  it("refuses a key that was already used for a different kind of action", async () => {
    prismaMock.subscriptionAction.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    prismaMock.subscriptionAction.findUnique.mockResolvedValue({ churchId: "church1", finixSubscriptionId: "subscription_X", actionType: "CANCEL", state: "COMPLETED", newValue: {} });
    await expect(donorUpdateSubscriptionAmount(ctx, 7500)).rejects.toMatchObject({ status: 409 });
    expect(finixMock.updateSubscription).not.toHaveBeenCalled();
  });

  it("reports 409 while the same key is still being processed", async () => {
    prismaMock.subscriptionAction.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    prismaMock.subscriptionAction.findUnique.mockResolvedValue({ churchId: "church1", finixSubscriptionId: "subscription_X", actionType: "UPDATE_AMOUNT", state: "PENDING" });
    await expect(donorUpdateSubscriptionAmount(ctx, 7500)).rejects.toMatchObject({ status: 409 });
  });

  it.each([[50], [99.5], [NaN]])("rejects invalid amount %s", async (bad) => {
    await expect(donorUpdateSubscriptionAmount(ctx, bad)).rejects.toBeInstanceOf(DonorSubscriptionError);
    expect(finixMock.updateSubscription).not.toHaveBeenCalled();
  });

  it("refuses pledge installments, ended gifts and unchanged amounts", async () => {
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ ...sub, isPledge: true });
    await expect(donorUpdateSubscriptionAmount(ctx, 7500)).rejects.toMatchObject({ status: 400 });
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ ...sub, state: "CANCELED", canceledAt: new Date() });
    await expect(donorUpdateSubscriptionAmount(ctx, 7500)).rejects.toMatchObject({ status: 400 });
    prismaMock.finixSubscription.findFirst.mockResolvedValue(sub);
    await expect(donorUpdateSubscriptionAmount(ctx, 5000)).rejects.toMatchObject({ status: 400 });
    expect(finixMock.updateSubscription).not.toHaveBeenCalled();
  });
});

describe("donorCancelSubscription", () => {
  it("cancels at Finix, records it, and emits the event", async () => {
    await donorCancelSubscription(ctx, "moving");
    expect(finixMock.cancelSubscription).toHaveBeenCalledWith("subscription_X");
    expect(prismaMock.finixSubscription.update.mock.calls[0][0].data).toMatchObject({ state: "CANCELED", canceledByUserId: null });
    expect(emitEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: "recurring.cancelled", churchId: "church1" }));
  });

  it("does not mark the gift canceled when Finix fails", async () => {
    finixMock.cancelSubscription.mockRejectedValue(new Error("boom"));
    await expect(donorCancelSubscription(ctx)).rejects.toMatchObject({ status: 502 });
    expect(prismaMock.finixSubscription.update).not.toHaveBeenCalled();
  });

  it("refuses an already-canceled gift or a pledge", async () => {
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ ...sub, canceledAt: new Date(), state: "CANCELED" });
    await expect(donorCancelSubscription(ctx)).rejects.toMatchObject({ status: 400 });
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ ...sub, isPledge: true });
    await expect(donorCancelSubscription(ctx)).rejects.toMatchObject({ status: 400 });
    expect(finixMock.cancelSubscription).not.toHaveBeenCalled();
  });
});

describe("createDonorPaymentUpdateSetupUrl", () => {
  it("creates a short-lived setup link bound to this subscription and returns its /setup url", async () => {
    const url = await createDonorPaymentUpdateSetupUrl(ctx);
    expect(url).toMatch(/^\/setup\/[0-9a-f]{64}$/);
    const data = prismaMock.subscriptionSetupLink.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ churchId: "church1", donorId: "d1", updateTargetFinixSubscriptionId: "subscription_X" });
    expect(data.tokenHash).not.toContain(url.slice(7));
  });
});
