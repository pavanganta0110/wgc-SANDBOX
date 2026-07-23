import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkNonprofitVerificationStatus, assertNonprofitApproved } from "@/lib/onboarding/nonprofitVerificationGuard";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    church: {
      findUnique: vi.fn(),
    },
    onboardingInternalDocument: {
      findFirst: vi.fn(),
    },
  },
}));

describe("nonprofitVerificationGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NOT_FOUND for empty or invalid churchId", async () => {
    const result = await checkNonprofitVerificationStatus("");
    expect(result.isApproved).toBe(false);
    expect(result.status).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND if church does not exist in DB", async () => {
    vi.mocked(prisma.church.findUnique).mockResolvedValue(null as any);
    const result = await checkNonprofitVerificationStatus("church_123");
    expect(result.isApproved).toBe(false);
    expect(result.status).toBe("NOT_FOUND");
  });

  it("returns REJECTED if church status is DISABLED or REJECTED", async () => {
    vi.mocked(prisma.church.findUnique).mockResolvedValue({
      id: "church_123",
      status: "DISABLED",
      finixMerchantId: "MU123",
    } as any);
    const result = await checkNonprofitVerificationStatus("church_123");
    expect(result.isApproved).toBe(false);
    expect(result.status).toBe("REJECTED");
  });

  it("returns PENDING_REVIEW if church lacks finixMerchantId", async () => {
    vi.mocked(prisma.church.findUnique).mockResolvedValue({
      id: "church_123",
      status: "PENDING",
      finixMerchantId: null,
    } as any);
    const result = await checkNonprofitVerificationStatus("church_123");
    expect(result.isApproved).toBe(false);
    expect(result.status).toBe("PENDING_REVIEW");
  });

  it("returns REJECTED if IRS 501(c)(3) document is REJECTED", async () => {
    vi.mocked(prisma.church.findUnique).mockResolvedValue({
      id: "church_123",
      status: "ACTIVE",
      finixMerchantId: "MU123",
      onboardingApplicationId: "app_123",
    } as any);
    vi.mocked(prisma.onboardingInternalDocument.findFirst).mockResolvedValue({
      id: "doc_123",
      status: "REJECTED",
      organizationFacingMessage: "Invalid tax document",
    } as any);

    const result = await checkNonprofitVerificationStatus("church_123");
    expect(result.isApproved).toBe(false);
    expect(result.status).toBe("REJECTED");
  });

  it("returns ACTION_REQUIRED if IRS 501(c)(3) document NEEDS_REPLACEMENT", async () => {
    vi.mocked(prisma.church.findUnique).mockResolvedValue({
      id: "church_123",
      status: "ACTIVE",
      finixMerchantId: "MU123",
      onboardingApplicationId: "app_123",
    } as any);
    vi.mocked(prisma.onboardingInternalDocument.findFirst).mockResolvedValue({
      id: "doc_123",
      status: "NEEDS_REPLACEMENT",
      organizationFacingMessage: "Clearer copy required",
    } as any);

    const result = await checkNonprofitVerificationStatus("church_123");
    expect(result.isApproved).toBe(false);
    expect(result.status).toBe("ACTION_REQUIRED");
  });

  it("returns VERIFIED_BY_WGC if IRS 501(c)(3) document is VERIFIED_BY_WGC", async () => {
    vi.mocked(prisma.church.findUnique).mockResolvedValue({
      id: "church_123",
      status: "ACTIVE",
      finixMerchantId: "MU123",
      onboardingApplicationId: "app_123",
    } as any);
    vi.mocked(prisma.onboardingInternalDocument.findFirst).mockResolvedValue({
      id: "doc_123",
      status: "VERIFIED_BY_WGC",
    } as any);

    const result = await checkNonprofitVerificationStatus("church_123");
    expect(result.isApproved).toBe(true);
    expect(result.status).toBe("VERIFIED_BY_WGC");
  });

  it("assertNonprofitApproved throws user-facing error message when unapproved", async () => {
    vi.mocked(prisma.church.findUnique).mockResolvedValue(null as any);
    await expect(assertNonprofitApproved("church_unapproved")).rejects.toThrow(
      "This organization is not currently approved to accept donations."
    );
  });
});
