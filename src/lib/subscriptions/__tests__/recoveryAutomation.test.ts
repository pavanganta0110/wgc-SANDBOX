import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  finixSubscription: { findUnique: vi.fn(), update: vi.fn() },
  subscriptionRecoveryAttempt: { create: vi.fn(), findFirst: vi.fn() },
  donor: { findFirst: vi.fn() },
  church: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockSendUpdateLink = vi.fn();
vi.mock("@/lib/subscriptions/paymentUpdateLink", () => ({ sendSubscriptionPaymentUpdateLink: mockSendUpdateLink }));

const mockEmitEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/events/emitEvent", () => ({ emitEvent: mockEmitEvent }));

function subscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sub-row-1",
    churchId: "church-a",
    finixSubscriptionId: "fx-sub-1",
    donorId: "donor1",
    state: "ACTIVE",
    canceledAt: null,
    completedAt: null,
    retryCount: 0,
    ...overrides,
  };
}

describe("triggerRecoveryOnPaymentFailure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing for a non-FAILED payment", async () => {
    const { triggerRecoveryOnPaymentFailure } = await import("../recoveryAutomation");
    await triggerRecoveryOnPaymentFailure({ status: "SUCCEEDED", finixSubscriptionId: "fx-sub-1" });
    expect(mockPrisma.finixSubscription.findUnique).not.toHaveBeenCalled();
  });

  it("does nothing when the payment has no finixSubscriptionId", async () => {
    const { triggerRecoveryOnPaymentFailure } = await import("../recoveryAutomation");
    await triggerRecoveryOnPaymentFailure({ status: "FAILED", finixSubscriptionId: null });
    expect(mockPrisma.finixSubscription.findUnique).not.toHaveBeenCalled();
  });

  it("updates failureCode/failureMessage/retryCount on the subscription", async () => {
    mockPrisma.finixSubscription.findUnique.mockResolvedValue(subscription({ retryCount: 2 }));
    mockPrisma.donor.findFirst.mockResolvedValue({ id: "donor1", email: "jane@example.com" });
    mockPrisma.subscriptionRecoveryAttempt.findFirst.mockResolvedValue(null);
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church" });
    mockSendUpdateLink.mockResolvedValue({ success: true, linkId: "link1", expiresAt: new Date() });

    const { triggerRecoveryOnPaymentFailure } = await import("../recoveryAutomation");
    await triggerRecoveryOnPaymentFailure({ status: "FAILED", finixSubscriptionId: "fx-sub-1", failureCode: "card_declined", failureMessage: "Card declined" });

    expect(mockPrisma.finixSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub-row-1" },
      data: { failureCode: "card_declined", failureMessage: "Card declined", retryCount: 3 },
    });
  });

  it("sends a payment-update-link email and emits recurring.retry_scheduled on success", async () => {
    mockPrisma.finixSubscription.findUnique.mockResolvedValue(subscription());
    mockPrisma.donor.findFirst.mockResolvedValue({ id: "donor1", email: "jane@example.com" });
    mockPrisma.subscriptionRecoveryAttempt.findFirst.mockResolvedValue(null);
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church" });
    mockSendUpdateLink.mockResolvedValue({ success: true, linkId: "link1", expiresAt: new Date() });

    const { triggerRecoveryOnPaymentFailure } = await import("../recoveryAutomation");
    await triggerRecoveryOnPaymentFailure({ status: "FAILED", finixSubscriptionId: "fx-sub-1" });

    expect(mockSendUpdateLink).toHaveBeenCalled();
    expect(mockPrisma.subscriptionRecoveryAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "UPDATE_LINK_SENT", setupLinkId: "link1" }) })
    );
    expect(mockEmitEvent).toHaveBeenCalledWith({ type: "recurring.retry_scheduled", churchId: "church-a", data: { finixSubscriptionId: "fx-sub-1", donorId: "donor1" } });
  });

  it("skips (and logs) without sending when the subscription is CANCELED", async () => {
    mockPrisma.finixSubscription.findUnique.mockResolvedValue(subscription({ state: "CANCELED", canceledAt: new Date() }));

    const { triggerRecoveryOnPaymentFailure } = await import("../recoveryAutomation");
    await triggerRecoveryOnPaymentFailure({ status: "FAILED", finixSubscriptionId: "fx-sub-1" });

    expect(mockSendUpdateLink).not.toHaveBeenCalled();
    expect(mockPrisma.subscriptionRecoveryAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SKIPPED_NOT_ACTIVE_OR_PAST_DUE" }) }));
  });

  it("skips without sending when the donor has no email on file", async () => {
    mockPrisma.finixSubscription.findUnique.mockResolvedValue(subscription());
    mockPrisma.donor.findFirst.mockResolvedValue({ id: "donor1", email: null });

    const { triggerRecoveryOnPaymentFailure } = await import("../recoveryAutomation");
    await triggerRecoveryOnPaymentFailure({ status: "FAILED", finixSubscriptionId: "fx-sub-1" });

    expect(mockSendUpdateLink).not.toHaveBeenCalled();
    expect(mockPrisma.subscriptionRecoveryAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SKIPPED_NO_DONOR_EMAIL" }) }));
  });

  it("skips sending a second email within the cooldown window", async () => {
    mockPrisma.finixSubscription.findUnique.mockResolvedValue(subscription());
    mockPrisma.donor.findFirst.mockResolvedValue({ id: "donor1", email: "jane@example.com" });
    mockPrisma.subscriptionRecoveryAttempt.findFirst.mockResolvedValue({ id: "prior-attempt" });

    const { triggerRecoveryOnPaymentFailure } = await import("../recoveryAutomation");
    await triggerRecoveryOnPaymentFailure({ status: "FAILED", finixSubscriptionId: "fx-sub-1" });

    expect(mockSendUpdateLink).not.toHaveBeenCalled();
    expect(mockPrisma.subscriptionRecoveryAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SKIPPED_RECENTLY_SENT" }) }));
  });

  it("does not emit recurring.retry_scheduled when the email fails to send", async () => {
    mockPrisma.finixSubscription.findUnique.mockResolvedValue(subscription());
    mockPrisma.donor.findFirst.mockResolvedValue({ id: "donor1", email: "jane@example.com" });
    mockPrisma.subscriptionRecoveryAttempt.findFirst.mockResolvedValue(null);
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church" });
    mockSendUpdateLink.mockResolvedValue({ success: false, linkId: "link1", expiresAt: new Date() });

    const { triggerRecoveryOnPaymentFailure } = await import("../recoveryAutomation");
    await triggerRecoveryOnPaymentFailure({ status: "FAILED", finixSubscriptionId: "fx-sub-1" });

    expect(mockEmitEvent).not.toHaveBeenCalled();
    expect(mockPrisma.subscriptionRecoveryAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "UPDATE_LINK_SEND_FAILED" }) }));
  });
});
