import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  church: { findUnique: vi.fn(), update: vi.fn() },
  partnerBillableApproval: { upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { attachChurchToPartner } from "../partnerBilling";

const params = { churchId: "c1", partnerId: "p1", partnerReference: "loc_1", onboardingApplicationId: "app1" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.church.update.mockResolvedValue({});
  prismaMock.partnerBillableApproval.upsert.mockResolvedValue({});
});

describe("attachChurchToPartner", () => {
  it("links the organization to the partner with its reference and records one billable approval", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ partnerId: null, partnerReference: null });
    await attachChurchToPartner(params);
    expect(prismaMock.church.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { partnerId: "p1", partnerReference: "loc_1" } });
    const upsert = prismaMock.partnerBillableApproval.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ churchId: "c1" });
    expect(upsert.create).toMatchObject({ partnerId: "p1", churchId: "c1", onboardingApplicationId: "app1" });
    expect(upsert.update).toEqual({});
  });

  it("is a no-op the second time (a repeated webhook never bills twice)", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ partnerId: "p1", partnerReference: "loc_1" });
    await attachChurchToPartner(params);
    expect(prismaMock.church.update).not.toHaveBeenCalled();
    // The upsert's update branch is empty, so an existing approval is left exactly as it was.
    expect(prismaMock.partnerBillableApproval.upsert.mock.calls[0][0].update).toEqual({});
  });

  it("never moves an organization that already belongs to another partner", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ partnerId: "someone-else", partnerReference: "x" });
    await attachChurchToPartner(params);
    expect(prismaMock.church.update).not.toHaveBeenCalled();
    expect(prismaMock.partnerBillableApproval.upsert).not.toHaveBeenCalled();
  });

  it("links without the reference when the partner already uses it for another organization", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ partnerId: null, partnerReference: null });
    prismaMock.church.update
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }))
      .mockResolvedValueOnce({});
    await attachChurchToPartner(params);
    expect(prismaMock.church.update).toHaveBeenLastCalledWith({ where: { id: "c1" }, data: { partnerId: "p1", partnerReference: null } });
    expect(prismaMock.partnerBillableApproval.upsert).toHaveBeenCalled();
  });

  it("never throws", async () => {
    prismaMock.church.findUnique.mockRejectedValue(new Error("db down"));
    await expect(attachChurchToPartner(params)).resolves.toBeUndefined();
  });
});
