import { describe, it, expect, vi, beforeEach } from "vitest";

const session = vi.hoisted(() => ({ getAdminSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);
const prismaMock = vi.hoisted(() => ({
  onboardingApplication: { findMany: vi.fn() },
  church: { findMany: vi.fn() },
  partner: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "../route";

const app = (over: Record<string, unknown>) => ({ id: "a1", organizationName: "Grace", contactEmail: "g@x.co", onboardingStatus: "APPROVED", documents: [], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  session.getAdminSession.mockResolvedValue({ email: "admin@wgc.test" });
  prismaMock.church.findMany.mockResolvedValue([]);
  prismaMock.partner.findMany.mockResolvedValue([{ id: "p1", name: "CV Campus OS" }]);
});

describe("GET /api/admin/merchant-applications — partner column", () => {
  it("is for signed-in admins only", async () => {
    session.getAdminSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("says which partner an application came through, and null for a direct sign-up", async () => {
    prismaMock.onboardingApplication.findMany.mockResolvedValue([
      app({ id: "a1", partnerId: "p1", partnerReference: "loc_1" }),
      app({ id: "a2", partnerId: null, partnerReference: null }),
    ]);
    const body = await (await GET()).json();
    expect(body.applications[0].partner).toEqual({ id: "p1", name: "CV Campus OS", reference: "loc_1" });
    expect(body.applications[1].partner).toBeNull();
    expect(prismaMock.partner.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["p1"] } });
  });

  it("does not leak the raw partner fields, and still works with no partner applications", async () => {
    prismaMock.onboardingApplication.findMany.mockResolvedValue([app({ partnerId: null, partnerReference: null })]);
    const body = await (await GET()).json();
    expect(body.applications[0]).not.toHaveProperty("partnerId");
    expect(prismaMock.partner.findMany).not.toHaveBeenCalled();
  });

  it("labels an application whose partner no longer exists instead of failing", async () => {
    prismaMock.partner.findMany.mockResolvedValue([]);
    prismaMock.onboardingApplication.findMany.mockResolvedValue([app({ partnerId: "gone", partnerReference: null })]);
    const body = await (await GET()).json();
    expect(body.applications[0].partner).toEqual({ id: "gone", name: "Unknown partner", reference: null });
  });
});
