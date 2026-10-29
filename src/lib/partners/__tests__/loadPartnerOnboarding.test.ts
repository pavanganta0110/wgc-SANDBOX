import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ onboardingApplication: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { loadPartnerOnboarding } from "../loadPartnerOnboarding";

beforeEach(() => vi.clearAllMocks());

const row = (over: Record<string, unknown>) => ({
  id: "a1",
  organizationName: "Grace",
  legalBusinessName: null,
  partnerReference: "loc_1",
  status: "UNDER_REVIEW",
  onboardingStatus: null,
  submittedAt: new Date("2026-01-02T00:00:00Z"),
  approvedAt: null,
  rejectedAt: null,
  updateRequestedItems: null,
  updateRequestedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("loadPartnerOnboarding", () => {
  it("asks only for the given partner's applications and never selects a token", async () => {
    prismaMock.onboardingApplication.findMany.mockResolvedValue([]);
    await loadPartnerOnboarding("p1");
    const args = prismaMock.onboardingApplication.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ partnerId: "p1" });
    expect(Object.keys(args.select).some((k) => /token/i.test(k))).toBe(false);
  });

  it("maps each application to a stage, and shows what is missing only while it is missing", async () => {
    prismaMock.onboardingApplication.findMany.mockResolvedValue([
      row({ id: "a1" }),
      row({ id: "a2", onboardingStatus: "MORE_INFORMATION_REQUIRED", updateRequestedItems: "• IRS letter", updateRequestedAt: new Date("2026-01-03T00:00:00Z") }),
      row({ id: "a3", onboardingStatus: "APPROVED", approvedAt: new Date("2026-01-04T00:00:00Z"), updateRequestedItems: "• old request" }),
    ]);
    const rows = await loadPartnerOnboarding("p1");
    expect(rows.map((r) => r.stage)).toEqual(["submitted", "information_required", "approved"]);
    expect(rows[0]).toMatchObject({ reference: "loc_1", stageLabel: "Submitted", requestedItems: [] });
    expect(rows[1].requestedItems).toEqual(["IRS letter"]);
    expect(rows[2].requestedItems).toEqual([]);
    expect(rows[2].approvedAt).toBe("2026-01-04T00:00:00.000Z");
  });

  it("prefers the legal business name", async () => {
    prismaMock.onboardingApplication.findMany.mockResolvedValue([row({ legalBusinessName: "Grace Community Church Inc" })]);
    expect((await loadPartnerOnboarding("p1"))[0].organizationName).toBe("Grace Community Church Inc");
  });
});
