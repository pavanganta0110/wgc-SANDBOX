import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { eventRegistration: { findMany: (...a: unknown[]) => findMany(...a), updateMany: (...a: unknown[]) => updateMany(...a) } },
}));

import { registrationStatusForPayment, syncEventRegistrationWithPayment } from "@/lib/eventRegistration/paymentOutcome";

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("registrationStatusForPayment", () => {
  it("un-confirms a registration whose bank payment failed or was returned", () => {
    for (const s of ["FAILED", "RETURNED", "CANCELED", "REVERSED", "failed"]) expect(registrationStatusForPayment(s, "CONFIRMED")).toBe("PAYMENT_FAILED");
  });
  it("restores it if the payment is later corrected to SUCCEEDED", () => {
    expect(registrationStatusForPayment("SUCCEEDED", "PAYMENT_FAILED")).toBe("CONFIRMED");
  });
  it("leaves everything else alone", () => {
    expect(registrationStatusForPayment("PENDING", "CONFIRMED")).toBeNull();
    expect(registrationStatusForPayment("SUCCEEDED", "CONFIRMED")).toBeNull();
    expect(registrationStatusForPayment("FAILED", "PAYMENT_FAILED")).toBeNull();
    expect(registrationStatusForPayment("FAILED", "CANCELED")).toBeNull();
  });
});

describe("syncEventRegistrationWithPayment", () => {
  it("only looks at this church's registrations for that payment", async () => {
    findMany.mockResolvedValue([]);
    await syncEventRegistrationWithPayment("churchA", "pay1", "FAILED");
    expect(findMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", paymentId: "pay1" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("marks a confirmed registration PAYMENT_FAILED with a note for the merchant, guarded by its current status", async () => {
    findMany.mockResolvedValue([{ id: "r1", status: "CONFIRMED" }]);
    await syncEventRegistrationWithPayment("churchA", "pay1", "RETURNED");
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "r1", churchId: "churchA", status: "CONFIRMED" });
    expect(arg.data.status).toBe("PAYMENT_FAILED");
    expect(arg.data.internalNote).toMatch(/follow up/i);
  });

  it("restores a registration and clears the note when the payment succeeds", async () => {
    findMany.mockResolvedValue([{ id: "r1", status: "PAYMENT_FAILED" }]);
    await syncEventRegistrationWithPayment("churchA", "pay1", "SUCCEEDED");
    expect(updateMany.mock.calls[0][0].data).toEqual({ status: "CONFIRMED", internalNote: null });
  });

  it("does nothing for a payment that belongs to no event registration", async () => {
    findMany.mockResolvedValue([]);
    await syncEventRegistrationWithPayment("churchA", "ordinaryDonation", "FAILED");
    expect(updateMany).not.toHaveBeenCalled();
  });
});
