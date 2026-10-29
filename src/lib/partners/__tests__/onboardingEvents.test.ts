import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  onboardingApplication: { findUnique: vi.fn() },
  church: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const recordPartnerEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../partnerWebhooks", () => ({ recordPartnerEvent }));

import { notifyPartnerOfOnboardingStage } from "../onboardingEvents";

const base = {
  id: "app1",
  partnerId: "p1",
  partnerReference: "loc_1",
  organizationName: "Grace",
  legalBusinessName: "Grace Community Church Inc",
  status: "UNDER_REVIEW",
  onboardingStatus: null as string | null,
  submittedAt: new Date("2026-01-02T00:00:00Z") as Date | null,
  approvedAt: null as Date | null,
  rejectedAt: null as Date | null,
  updateRequestedItems: null as string | null,
  updateRequestedAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.church.findFirst.mockResolvedValue(null);
});

describe("notifyPartnerOfOnboardingStage", () => {
  it("does nothing for an application with no partner", async () => {
    prismaMock.onboardingApplication.findUnique.mockResolvedValue({ ...base, partnerId: null });
    await notifyPartnerOfOnboardingStage({ applicationId: "app1" });
    expect(recordPartnerEvent).not.toHaveBeenCalled();
  });

  it("announces 'submitted' tagged with the organization and the partner's reference", async () => {
    prismaMock.onboardingApplication.findUnique.mockResolvedValue(base);
    await notifyPartnerOfOnboardingStage({ applicationId: "app1" });
    const call = recordPartnerEvent.mock.calls[0][0];
    expect(call.partnerId).toBe("p1");
    expect(call.type).toBe("onboarding.submitted");
    expect(call.onboardingApplicationId).toBe("app1");
    expect(call.data.organization).toEqual({ id: null, name: "Grace Community Church Inc", reference: "loc_1" });
    expect(call.data.stage).toBe("submitted");
  });

  it("does not announce a stage the application was already in", async () => {
    prismaMock.onboardingApplication.findUnique.mockResolvedValue({ ...base, onboardingStatus: "UNDER_REVIEW" });
    await notifyPartnerOfOnboardingStage({ applicationId: "app1", previousStage: "under_review" });
    expect(recordPartnerEvent).not.toHaveBeenCalled();
  });

  it("includes what is missing and the upload link for 'information required'", async () => {
    prismaMock.onboardingApplication.findUnique.mockResolvedValue({
      ...base,
      onboardingStatus: "MORE_INFORMATION_REQUIRED",
      updateRequestedItems: "• IRS letter<br/>• Bank proof",
      updateRequestedAt: new Date("2026-01-03T00:00:00Z"),
    });
    await notifyPartnerOfOnboardingStage({ applicationId: "app1", previousStage: "under_review", updateUrl: "https://wgc.test/onboarding/update/tok" });
    const data = recordPartnerEvent.mock.calls[0][0].data;
    expect(recordPartnerEvent.mock.calls[0][0].type).toBe("onboarding.information_required");
    expect(data.requestedItems).toEqual(["IRS letter", "Bank proof"]);
    expect(data.updateUrl).toBe("https://wgc.test/onboarding/update/tok");
  });

  it("adds the organization's id once approved", async () => {
    prismaMock.onboardingApplication.findUnique.mockResolvedValue({ ...base, onboardingStatus: "APPROVED", approvedAt: new Date("2026-01-04T00:00:00Z") });
    prismaMock.church.findFirst.mockResolvedValue({ id: "church9" });
    await notifyPartnerOfOnboardingStage({ applicationId: "app1", previousStage: "under_review" });
    const call = recordPartnerEvent.mock.calls[0][0];
    expect(call.type).toBe("onboarding.approved");
    expect(call.data.organization.id).toBe("church9");
    expect(call.data.updateUrl).toBeUndefined();
  });

  it("never throws", async () => {
    prismaMock.onboardingApplication.findUnique.mockRejectedValue(new Error("db down"));
    await expect(notifyPartnerOfOnboardingStage({ applicationId: "app1" })).resolves.toBeUndefined();
  });
});

import { notifyPartnerOfInformationSubmitted } from "../onboardingEvents";

describe("notifyPartnerOfInformationSubmitted", () => {
  it("does nothing for an application with no partner", async () => {
    prismaMock.onboardingApplication.findUnique.mockResolvedValue({ ...base, partnerId: null, lastUpdateSubmittedAt: new Date() });
    await notifyPartnerOfInformationSubmitted("app1");
    expect(recordPartnerEvent).not.toHaveBeenCalled();
  });

  it("announces that the answer is in, tagged with the partner's reference", async () => {
    const at = new Date("2026-01-05T00:00:00Z");
    prismaMock.onboardingApplication.findUnique.mockResolvedValue({ ...base, lastUpdateSubmittedAt: at });
    await notifyPartnerOfInformationSubmitted("app1");
    const call = recordPartnerEvent.mock.calls[0][0];
    expect(call).toMatchObject({ partnerId: "p1", type: "onboarding.information_submitted", onboardingApplicationId: "app1" });
    expect(call.data.organization).toEqual({ id: null, name: "Grace Community Church Inc", reference: "loc_1" });
    expect(call.data.submittedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("never throws", async () => {
    prismaMock.onboardingApplication.findUnique.mockRejectedValue(new Error("db down"));
    await expect(notifyPartnerOfInformationSubmitted("app1")).resolves.toBeUndefined();
  });
});
