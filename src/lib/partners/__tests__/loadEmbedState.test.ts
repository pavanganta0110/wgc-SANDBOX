import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  church: { findFirst: vi.fn() },
  onboardingApplication: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { loadPartnerEmbedState } from "../loadEmbedState";

const app = (over: Record<string, unknown>) => ({
  status: "SUBMITTED",
  onboardingStatus: null,
  submittedAt: new Date("2026-10-01"),
  organizationName: "Grace",
  legalBusinessName: null,
  updateRequestedItems: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.church.findFirst.mockResolvedValue(null);
  prismaMock.onboardingApplication.findFirst.mockResolvedValue(null);
});

describe("what the partner's frame shows", () => {
  it("scopes both lookups by the partner and the reference", async () => {
    await loadPartnerEmbedState("p1", "loc_1");
    expect(prismaMock.church.findFirst.mock.calls[0][0].where).toEqual({ partnerId: "p1", partnerReference: "loc_1" });
    expect(prismaMock.onboardingApplication.findFirst.mock.calls[0][0].where).toEqual({ partnerId: "p1", partnerReference: "loc_1" });
  });

  it("the form when there is no application or it was never submitted", async () => {
    expect(await loadPartnerEmbedState("p1", "r")).toEqual({ kind: "form" });
    prismaMock.onboardingApplication.findFirst.mockResolvedValue(app({ submittedAt: null }));
    expect(await loadPartnerEmbedState("p1", "r")).toEqual({ kind: "form" });
  });

  it("submitted, then under review", async () => {
    prismaMock.onboardingApplication.findFirst.mockResolvedValue(app({}));
    expect(await loadPartnerEmbedState("p1", "r")).toMatchObject({ kind: "pending", stage: "submitted" });
    prismaMock.onboardingApplication.findFirst.mockResolvedValue(app({ onboardingStatus: "UNDER_REVIEW" }));
    expect(await loadPartnerEmbedState("p1", "r")).toMatchObject({ kind: "pending", stage: "under_review" });
  });

  it("information required lists what is missing", async () => {
    prismaMock.onboardingApplication.findFirst.mockResolvedValue(app({ onboardingStatus: "MORE_INFORMATION_REQUIRED", updateRequestedItems: "• Bank letter<br/>• Board list" }));
    expect(await loadPartnerEmbedState("p1", "r")).toEqual({ kind: "information_required", organizationName: "Grace", items: ["Bank letter", "Board list"] });
  });

  it("approved without an organization yet is setting up, and with one it is ready", async () => {
    prismaMock.onboardingApplication.findFirst.mockResolvedValue(app({ onboardingStatus: "APPROVED" }));
    expect(await loadPartnerEmbedState("p1", "r")).toMatchObject({ kind: "setting_up" });
    prismaMock.church.findFirst.mockResolvedValue({ id: "c1", name: "Grace Community" });
    expect(await loadPartnerEmbedState("p1", "r")).toEqual({ kind: "ready", churchId: "c1", organizationName: "Grace Community" });
  });

  it("rejected", async () => {
    prismaMock.onboardingApplication.findFirst.mockResolvedValue(app({ onboardingStatus: "REJECTED" }));
    expect(await loadPartnerEmbedState("p1", "r")).toMatchObject({ kind: "rejected" });
  });
});
