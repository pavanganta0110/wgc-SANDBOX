import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  church: { update: vi.fn().mockResolvedValue({}) },
  onboardingApplication: { update: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockSendWgcAdminEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({ sendWgcAdminEmail: (...a: unknown[]) => mockSendWgcAdminEmail(...a) }));

function onboardingApplication(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "app-1",
    onboardingStatus: "APPROVED",
    contactEmail: "chris@springfieldbsu.org",
    organizationName: "Springfield Area Collegiate Ministry",
    legalBusinessName: null,
    ...overrides,
  };
}

describe("handleMerchantTermination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks both the Church and OnboardingApplication TERMINATED and alerts WGC admin", async () => {
    const { handleMerchantTermination } = await import("../handleMerchantTermination");

    const result = await handleMerchantTermination({
      church: { id: "church-1", status: "ACTIVE" },
      onboardingApplication: onboardingApplication(),
      finixMerchantId: "MU123",
      terminationDetails: { reason: "CHURNED", description: "Staying with Stripe.", terminated_at: "2026-09-23T15:19:13.26Z" },
    });

    expect(result.applied).toBe(true);
    expect(mockPrisma.church.update).toHaveBeenCalledWith({
      where: { id: "church-1" },
      data: { status: "TERMINATED", terminatedAt: new Date("2026-09-23T15:19:13.26Z"), terminationReason: "Staying with Stripe." },
    });
    expect(mockPrisma.onboardingApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app-1" }, data: expect.objectContaining({ onboardingStatus: "TERMINATED" }) })
    );
    expect(mockSendWgcAdminEmail).toHaveBeenCalledWith(expect.objectContaining({ newStatus: "TERMINATED" }));
  });

  it("is a no-op when the Church is already TERMINATED", async () => {
    const { handleMerchantTermination } = await import("../handleMerchantTermination");
    const result = await handleMerchantTermination({
      church: { id: "church-1", status: "TERMINATED" },
      onboardingApplication: onboardingApplication(),
      finixMerchantId: "MU123",
      terminationDetails: null,
    });

    expect(result.applied).toBe(false);
    expect(mockPrisma.church.update).not.toHaveBeenCalled();
    expect(mockSendWgcAdminEmail).not.toHaveBeenCalled();
  });

  it("is a no-op when the application is already TERMINATED even if the Church record is missing/stale", async () => {
    const { handleMerchantTermination } = await import("../handleMerchantTermination");
    const result = await handleMerchantTermination({
      church: { id: "church-1", status: "ACTIVE" },
      onboardingApplication: onboardingApplication({ onboardingStatus: "TERMINATED" }),
      finixMerchantId: "MU123",
      terminationDetails: null,
    });

    expect(result.applied).toBe(false);
    expect(mockPrisma.church.update).not.toHaveBeenCalled();
  });

  it("updates the Church even when there is no linked OnboardingApplication, and sends no admin email in that case", async () => {
    const { handleMerchantTermination } = await import("../handleMerchantTermination");
    const result = await handleMerchantTermination({
      church: { id: "church-1", status: "ACTIVE" },
      onboardingApplication: null,
      finixMerchantId: "MU123",
      terminationDetails: { reason: "CHURNED" },
    });

    expect(result.applied).toBe(true);
    expect(mockPrisma.church.update).toHaveBeenCalled();
    expect(mockSendWgcAdminEmail).not.toHaveBeenCalled();
  });

  it("falls back to the current time when Finix provides no terminated_at", async () => {
    const { handleMerchantTermination } = await import("../handleMerchantTermination");
    await handleMerchantTermination({
      church: { id: "church-1", status: "ACTIVE" },
      onboardingApplication: null,
      finixMerchantId: "MU123",
      terminationDetails: { reason: "CHURNED" },
    });

    const call = mockPrisma.church.update.mock.calls[0][0];
    expect(call.data.terminatedAt).toBeInstanceOf(Date);
  });
});
