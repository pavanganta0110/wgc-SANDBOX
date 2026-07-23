import { prisma } from "@/lib/prisma";

export interface NonprofitVerificationResult {
  isApproved: boolean;
  status: "VERIFIED_BY_WGC" | "PENDING_REVIEW" | "ACTION_REQUIRED" | "REJECTED" | "SUSPENDED" | "NOT_FOUND";
  reason?: string;
  church?: any;
  document?: any;
}

/**
  * Central guard function to verify if an organization has satisfied
  * all WGC & Finix 501(c)(3) nonprofit verification requirements before
  * accepting donations or processing payments.
  */
export async function checkNonprofitVerificationStatus(churchId: string): Promise<NonprofitVerificationResult> {
  if (!churchId) {
    return {
      isApproved: false,
      status: "NOT_FOUND",
      reason: "Missing organization ID",
    };
  }

  const church = await prisma.church.findUnique({
    where: { id: churchId },
  });

  if (!church) {
    return {
      isApproved: false,
      status: "NOT_FOUND",
      reason: "Organization not found",
    };
  }

  // Check general church status
  if (church.status === "DISABLED" || church.status === "REJECTED") {
    return {
      isApproved: false,
      status: "REJECTED",
      reason: "Organization is inactive or rejected",
      church,
    };
  }

  if (!church.finixMerchantId) {
    return {
      isApproved: false,
      status: "PENDING_REVIEW",
      reason: "Finix merchant onboarding is not completed",
      church,
    };
  }

  // Check 501(c)(3) IRS Determination Letter document review status if onboarding application exists
  let document = null;
  if (church.onboardingApplicationId) {
    document = await prisma.onboardingInternalDocument.findFirst({
      where: {
        onboardingApplicationId: church.onboardingApplicationId,
        documentType: "IRS_501C3_DETERMINATION_LETTER",
        isCurrent: true,
      },
      orderBy: { version: "desc" },
    });
  }

  if (document) {
    if (document.status === "REJECTED") {
      return {
        isApproved: false,
        status: "REJECTED",
        reason: document.organizationFacingMessage || "Nonprofit documentation was rejected",
        church,
        document,
      };
    }
    if (document.status === "NEEDS_REPLACEMENT") {
      return {
        isApproved: false,
        status: "ACTION_REQUIRED",
        reason: document.organizationFacingMessage || "Updated nonprofit documentation is required",
        church,
        document,
      };
    }
    if (document.status === "VERIFIED_BY_WGC") {
      return {
        isApproved: true,
        status: "VERIFIED_BY_WGC",
        church,
        document,
      };
    }
  }

  // For active approved live merchants with active Finix Merchant ID, preserve their ability to accept donations
  if (church.status === "ACTIVE" || church.status === "APPROVED") {
    return {
      isApproved: true,
      status: "VERIFIED_BY_WGC",
      church,
      document,
    };
  }

  return {
    isApproved: false,
    status: "PENDING_REVIEW",
    reason: "Nonprofit verification is pending review",
    church,
    document,
  };
}

/**
  * Asserts that an organization is approved to accept donations.
  * Throws an error with a clear donor-facing message if verification is incomplete.
  */
export async function assertNonprofitApproved(churchId: string): Promise<any> {
  const result = await checkNonprofitVerificationStatus(churchId);
  if (!result.isApproved) {
    throw new Error("This organization is not currently approved to accept donations.");
  }
  return result.church;
}
