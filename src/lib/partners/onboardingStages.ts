/**
 * What a partner sees for an application, in plain stages, instead of WGC's and
 * Finix's internal status names. The stage is derived from the application's own
 * onboardingStatus / status; nothing here changes how an application is reviewed.
 */

export type OnboardingStage = "draft" | "submitted" | "under_review" | "information_required" | "approved" | "rejected" | "failed";

export const STAGE_LABELS: Record<OnboardingStage, string> = {
  draft: "Not finished",
  submitted: "Submitted",
  under_review: "Under review",
  information_required: "Information required",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Could not be submitted",
};

export function onboardingStage(app: { status: string | null; onboardingStatus: string | null; submittedAt: Date | null }): OnboardingStage {
  switch (app.onboardingStatus) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "MORE_INFORMATION_REQUIRED":
    case "ADDITIONAL_INFO_NEEDED":
      return "information_required";
    case "UNDER_REVIEW":
      return "under_review";
  }
  if (app.status === "BANK_INSTRUMENT_FAILED" || app.status === "MERCHANT_CREATION_FAILED" || app.status === "IDENTITY_CREATION_FAILED") return "failed";
  if (app.submittedAt) return "submitted";
  return "draft";
}

/** The webhook event for entering a stage. Null for stages that aren't announced. */
export function eventTypeForStage(stage: OnboardingStage): string | null {
  switch (stage) {
    case "submitted":
      return "onboarding.submitted";
    case "under_review":
      return "onboarding.under_review";
    case "information_required":
      return "onboarding.information_required";
    case "approved":
      return "onboarding.approved";
    case "rejected":
      return "onboarding.rejected";
    default:
      return null;
  }
}

/** The requested items are stored as "• line<br/>• line" for the email; as a list for the partner. */
export function requestedItemsList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/<br\s*\/?>/i)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, "").replace(/<[^>]*>/g, "").trim())
    .filter(Boolean);
}
