import { describe, it, expect } from "vitest";
import { eventTypeForStage, onboardingStage, requestedItemsList, STAGE_LABELS } from "../onboardingStages";

const app = (over: Partial<{ status: string | null; onboardingStatus: string | null; submittedAt: Date | null }>) => ({
  status: "DRAFT",
  onboardingStatus: null,
  submittedAt: null,
  ...over,
});

describe("onboardingStage", () => {
  it("maps Finix onboarding statuses to the stages a partner sees", () => {
    expect(onboardingStage(app({ onboardingStatus: "APPROVED" }))).toBe("approved");
    expect(onboardingStage(app({ onboardingStatus: "REJECTED" }))).toBe("rejected");
    expect(onboardingStage(app({ onboardingStatus: "MORE_INFORMATION_REQUIRED" }))).toBe("information_required");
    expect(onboardingStage(app({ onboardingStatus: "ADDITIONAL_INFO_NEEDED" }))).toBe("information_required");
    expect(onboardingStage(app({ onboardingStatus: "UNDER_REVIEW" }))).toBe("under_review");
  });

  it("is 'submitted' once submitted and before Finix has reported anything", () => {
    expect(onboardingStage(app({ status: "UNDER_REVIEW", submittedAt: new Date() }))).toBe("submitted");
  });

  it("is 'draft' before submission and 'failed' when the submission broke", () => {
    expect(onboardingStage(app({}))).toBe("draft");
    expect(onboardingStage(app({ status: "BANK_INSTRUMENT_FAILED" }))).toBe("failed");
    expect(onboardingStage(app({ status: "MERCHANT_CREATION_FAILED" }))).toBe("failed");
  });

  it("lets the Finix status win over a stale local status", () => {
    expect(onboardingStage(app({ status: "UNDER_REVIEW", onboardingStatus: "APPROVED", submittedAt: new Date() }))).toBe("approved");
  });
});

describe("eventTypeForStage", () => {
  it("announces the stages a partner cares about", () => {
    expect(eventTypeForStage("submitted")).toBe("onboarding.submitted");
    expect(eventTypeForStage("under_review")).toBe("onboarding.under_review");
    expect(eventTypeForStage("information_required")).toBe("onboarding.information_required");
    expect(eventTypeForStage("approved")).toBe("onboarding.approved");
    expect(eventTypeForStage("rejected")).toBe("onboarding.rejected");
    expect(eventTypeForStage("draft")).toBeNull();
    expect(eventTypeForStage("failed")).toBeNull();
  });

  it("has a label for every stage", () => {
    for (const stage of ["draft", "submitted", "under_review", "information_required", "approved", "rejected", "failed"] as const) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
    }
  });
});

describe("requestedItemsList", () => {
  it("turns the email-style text into a clean list", () => {
    expect(requestedItemsList("• Upload your IRS letter<br/>• Confirm the bank account<br>")).toEqual(["Upload your IRS letter", "Confirm the bank account"]);
  });
  it("handles empty input and stray markup", () => {
    expect(requestedItemsList(null)).toEqual([]);
    expect(requestedItemsList("")).toEqual([]);
    expect(requestedItemsList("<b>One</b><br/>- Two")).toEqual(["One", "Two"]);
  });
});
