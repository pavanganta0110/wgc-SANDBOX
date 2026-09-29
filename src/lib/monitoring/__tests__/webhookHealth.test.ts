import { describe, it, expect, vi, beforeEach } from "vitest";

const { recordHealthEvent, mockPrisma } = vi.hoisted(() => ({
  recordHealthEvent: vi.fn().mockResolvedValue({ eventId: "e1", wgcReference: "WGC-ABC123" }),
  mockPrisma: { church: { findFirst: vi.fn() } },
}));
vi.mock("../healthEvents", () => ({ recordHealthEvent }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { recordWebhookProcessingFailure } from "../webhookHealth";

beforeEach(() => vi.clearAllMocks());

describe("recordWebhookProcessingFailure", () => {
  it("resolves the church id from the Finix merchant id when a match exists", async () => {
    mockPrisma.church.findFirst.mockResolvedValue({ id: "church_1" });
    await recordWebhookProcessingFailure({ provider: "finix", eventType: "transfer.updated", finixEventId: "evt_1", finixMerchantId: "MU123", errorMessage: "sync failed" });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ service: "Webhooks", merchantId: "church_1", externalId: "evt_1" }));
  });

  it("records with no merchantId when the Finix merchant id doesn't resolve to a known church — a miss is expected, not an error", async () => {
    mockPrisma.church.findFirst.mockResolvedValue(null);
    await recordWebhookProcessingFailure({ provider: "finix", eventType: "transfer.updated", finixEventId: "evt_1", finixMerchantId: "MU_unknown", errorMessage: "sync failed" });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ merchantId: undefined }));
  });

  it("skips the church lookup entirely when no Finix merchant id is available", async () => {
    await recordWebhookProcessingFailure({ provider: "finix", eventType: "transfer.updated", finixEventId: "evt_1", errorMessage: "sync failed" });
    expect(mockPrisma.church.findFirst).not.toHaveBeenCalled();
  });

  it("never throws even if the church lookup itself fails", async () => {
    mockPrisma.church.findFirst.mockRejectedValue(new Error("db down"));
    await expect(
      recordWebhookProcessingFailure({ provider: "finix", eventType: "transfer.updated", finixEventId: "evt_1", finixMerchantId: "MU123", errorMessage: "sync failed" })
    ).resolves.not.toThrow();
  });
});
