import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, finixMock, emitEventMock } = vi.hoisted(() => ({
  prismaMock: {
    donor: { findFirst: vi.fn(), findMany: vi.fn() },
    finixSubscription: { findFirst: vi.fn(), update: vi.fn() },
    finixPaymentInstrumentSnapshot: { findFirst: vi.fn() },
    subscriptionAction: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
  finixMock: { updateSubscription: vi.fn(), cancelSubscription: vi.fn(), createPaymentInstrument: vi.fn() },
  emitEventMock: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/finix/client", () => ({ finixClient: finixMock }));
vi.mock("@/lib/events/emitEvent", () => ({ emitEvent: emitEventMock }));
vi.mock("@/lib/finix/sync/syncPaymentInstruments", () => ({ syncPaymentInstrument: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { Prisma } from "@prisma/client";
import { isBankInstrumentType, donorUpdateSubscriptionAmount, donorCancelSubscription, donorUpdateSubscriptionCard, loadDonorCardUpdateContext, DonorSubscriptionError } from "../donorSubscriptions";

const ctx = { churchId: "church1", sessionDonorId: "d1", subscriptionId: "sub1", idempotencyKey: "key-1" };
const sub = {
  id: "sub1", churchId: "church1", donorId: "d1", finixSubscriptionId: "subscription_X", state: "ACTIVE", canceledAt: null, completedAt: null,
  amountCents: 5000, donationAmountCents: 5000, donorCoversFee: false, isPledge: false, finixPaymentInstrumentId: "PI1", finixBuyerIdentityId: "ID1", billingInterval: "MONTHLY", fundId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.donor.findFirst.mockResolvedValue({ id: "d1", email: "ann@example.com" });
  prismaMock.donor.findMany.mockResolvedValue([{ id: "d1", name: "Ann", email: "ann@example.com", normalizedEmail: "ann@example.com" }]);
  prismaMock.finixSubscription.findFirst.mockResolvedValue(sub);
  prismaMock.finixPaymentInstrumentSnapshot.findFirst.mockResolvedValue({ paymentMethodType: "PAYMENT_CARD", cardBrand: "VISA" });
  prismaMock.subscriptionAction.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  finixMock.updateSubscription.mockResolvedValue({});
  finixMock.cancelSubscription.mockResolvedValue({});
});

describe("isBankInstrumentType", () => {
  it("recognizes Finix's real type strings", () => {
    expect(isBankInstrumentType("BANK_ACCOUNT")).toBe(true);
    expect(isBankInstrumentType("PAYMENT_CARD")).toBe(false);
    expect(isBankInstrumentType(null)).toBe(false);
  });
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
    await expect(donorUpdateSubscriptionCard(ctx, "TKN12345")).rejects.toMatchObject({ status: 404 });
    await expect(loadDonorCardUpdateContext(ctx)).rejects.toMatchObject({ status: 404 });
    expect(finixMock.createPaymentInstrument).not.toHaveBeenCalled();
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

describe("donorUpdateSubscriptionCard", () => {
  beforeEach(() => {
    finixMock.createPaymentInstrument.mockResolvedValue({ id: "PInew", type: "PAYMENT_CARD", brand: "VISA", last_four: "4242" });
  });

  it("saves the card on the donor's own identity, then swaps it on the SAME subscription — no new subscription, no cancel", async () => {
    const r = await donorUpdateSubscriptionCard(ctx, "TKN12345");
    expect(finixMock.createPaymentInstrument).toHaveBeenCalledWith({ identity: "ID1", token: "TKN12345", type: "TOKEN" });
    expect(finixMock.updateSubscription).toHaveBeenCalledWith("subscription_X", { buyer_details: { instrument_id: "PInew" } });
    expect(finixMock.cancelSubscription).not.toHaveBeenCalled();
    expect(prismaMock.finixSubscription.update.mock.calls[0][0].data).toMatchObject({ finixPaymentInstrumentId: "PInew" });
    expect(r).toMatchObject({ last4: "4242", brand: "VISA" });
  });

  it("recomputes the covered fee in the same PUT when the new card's brand changes it", async () => {
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ ...sub, donorCoversFee: true, amountCents: 5180, donationAmountCents: 5000 });
    finixMock.createPaymentInstrument.mockResolvedValue({ id: "PIamex", type: "PAYMENT_CARD", brand: "AMERICAN_EXPRESS", last_four: "0005" });
    const r = (await donorUpdateSubscriptionCard(ctx, "TKN12345")) as { amountCents: number };
    const put = finixMock.updateSubscription.mock.calls[0][1];
    expect(put.buyer_details).toEqual({ instrument_id: "PIamex" });
    expect(put.amount).toBe(r.amountCents);
    expect(put.amount).toBeGreaterThan(5000);
  });

  it("does not touch the subscription when Finix rejects the card", async () => {
    finixMock.createPaymentInstrument.mockRejectedValue(new Error("declined"));
    await expect(donorUpdateSubscriptionCard(ctx, "TKN12345")).rejects.toMatchObject({ status: 502 });
    expect(finixMock.updateSubscription).not.toHaveBeenCalled();
    expect(prismaMock.finixSubscription.update).not.toHaveBeenCalled();
    expect(prismaMock.subscriptionAction.update.mock.calls[0][0].data.state).toBe("FAILED");
  });

  it("keeps the old card in the database when the swap itself fails", async () => {
    finixMock.updateSubscription.mockRejectedValue(new Error("boom"));
    await expect(donorUpdateSubscriptionCard(ctx, "TKN12345")).rejects.toMatchObject({ status: 502 });
    expect(prismaMock.finixSubscription.update).not.toHaveBeenCalled();
  });

  it("tells the donor when the card was declined at authorization, and leaves everything unchanged", async () => {
    finixMock.updateSubscription.mockRejectedValue(new Error('Finix Error: Authorization AU123 was declined.'));
    await expect(donorUpdateSubscriptionCard(ctx, "TKN12345")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("declined") });
    expect(prismaMock.finixSubscription.update).not.toHaveBeenCalled();
    expect(prismaMock.subscriptionAction.update.mock.calls[0][0].data.state).toBe("FAILED");
  });

  it("only accepts cards, only for active gifts, and refuses bank-funded gifts before calling Finix", async () => {
    finixMock.createPaymentInstrument.mockResolvedValue({ id: "PIbank", type: "BANK_ACCOUNT" });
    await expect(donorUpdateSubscriptionCard(ctx, "TKN12345")).rejects.toMatchObject({ status: 400 });
    expect(finixMock.updateSubscription).not.toHaveBeenCalled();

    vi.clearAllMocks();
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ ...sub, state: "CANCELED", canceledAt: new Date() });
    await expect(donorUpdateSubscriptionCard(ctx, "TKN12345")).rejects.toMatchObject({ status: 400 });

    prismaMock.finixSubscription.findFirst.mockResolvedValue(sub);
    prismaMock.finixPaymentInstrumentSnapshot.findFirst.mockResolvedValue({ paymentMethodType: "BANK_ACCOUNT", cardBrand: null });
    prismaMock.donor.findMany.mockResolvedValue([{ id: "d1", name: "Ann", email: "ann@example.com", normalizedEmail: "ann@example.com" }]);
    prismaMock.donor.findFirst.mockResolvedValue({ id: "d1", email: "ann@example.com" });
    await expect(donorUpdateSubscriptionCard(ctx, "TKN12345")).rejects.toMatchObject({ status: 400 });
    expect(finixMock.createPaymentInstrument).not.toHaveBeenCalled();
  });

  it("refuses a covered-fee gift whose donation amount is unknown (the fee can't be recomputed)", async () => {
    prismaMock.finixSubscription.findFirst.mockResolvedValue({ ...sub, donorCoversFee: true, donationAmountCents: null });
    await expect(donorUpdateSubscriptionCard(ctx, "TKN12345")).rejects.toMatchObject({ status: 400 });
    expect(finixMock.createPaymentInstrument).not.toHaveBeenCalled();
  });

  it("rejects a missing or oversized token", async () => {
    await expect(donorUpdateSubscriptionCard(ctx, "")).rejects.toMatchObject({ status: 400 });
    await expect(donorUpdateSubscriptionCard(ctx, "x".repeat(300))).rejects.toMatchObject({ status: 400 });
    expect(finixMock.createPaymentInstrument).not.toHaveBeenCalled();
  });

  it("replays a completed request without saving another card", async () => {
    prismaMock.subscriptionAction.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    prismaMock.subscriptionAction.findUnique.mockResolvedValue({ churchId: "church1", finixSubscriptionId: "subscription_X", actionType: "PAYMENT_METHOD_UPDATED", state: "COMPLETED", newValue: { last4: "4242" } });
    expect(await donorUpdateSubscriptionCard(ctx, "TKN12345")).toEqual({ last4: "4242" });
    expect(finixMock.createPaymentInstrument).not.toHaveBeenCalled();
  });
});
