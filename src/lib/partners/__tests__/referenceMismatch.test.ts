import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ church: { findFirst: vi.fn() }, onboardingApplication: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { findReferenceMismatch } from "../referenceMismatch";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.church.findFirst.mockResolvedValue(null);
  prismaMock.onboardingApplication.findFirst.mockResolvedValue(null);
});

describe("findReferenceMismatch", () => {
  it("does nothing without a contact email or name to compare", async () => {
    expect(await findReferenceMismatch("p1", "r2", { emails: [null, undefined] })).toBeNull();
    expect(prismaMock.church.findFirst).not.toHaveBeenCalled();
  });

  it("is not a mismatch when the reference already resolves to an organization or application", async () => {
    prismaMock.church.findFirst.mockResolvedValueOnce({ id: "c1" });
    expect(await findReferenceMismatch("p1", "r1", { emails: ["a@b.test"] })).toBeNull();
  });

  it("finds the reference an approved organization is registered under, scoped to the partner", async () => {
    prismaMock.church.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ partnerReference: "old" });
    expect(await findReferenceMismatch("p1", "new", { emails: ["A@B.test"] })).toEqual({ existingReference: "old" });
    const where = prismaMock.church.findFirst.mock.calls[1][0].where;
    expect(where.partnerId).toBe("p1");
    expect(where.OR[0]).toEqual({ primaryContactEmail: { equals: "a@b.test", mode: "insensitive" } });
  });

  it("falls back to a submitted application", async () => {
    prismaMock.onboardingApplication.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ partnerReference: "old" });
    expect(await findReferenceMismatch("p1", "new", { emails: [], organizationName: "Grace" })).toEqual({ existingReference: "old" });
  });

  it("returns null for a genuinely new organization", async () => {
    expect(await findReferenceMismatch("p1", "new", { emails: ["x@y.test"], organizationName: "New Org" })).toBeNull();
  });
});
