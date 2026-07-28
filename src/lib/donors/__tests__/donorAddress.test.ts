import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeDonor {
  id: string;
  churchId: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  addressSource: string | null;
  addressVerified: string;
  lastAddressConfirmedAt: Date | null;
  addressUpdatedAt: Date | null;
  addressUpdatedByUserId: string | null;
}

function makeDonor(overrides: Partial<FakeDonor> = {}): FakeDonor {
  return {
    id: "donor-1",
    churchId: "church-A",
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    addressSource: null,
    addressVerified: "UNVERIFIED",
    lastAddressConfirmedAt: null,
    addressUpdatedAt: null,
    addressUpdatedByUserId: null,
    ...overrides,
  };
}

function makePrismaMock(donor: FakeDonor) {
  const auditLogs: any[] = [];
  const prismaMock = {
    donor: {
      // Mirrors the real Donor.findFirst({ where: { id, churchId } }) scoping
      // — a donor that exists but belongs to a different church is treated
      // as not found, exactly like Prisma would with a real WHERE clause.
      findFirst: vi.fn((args: any) => {
        if (args.where.id !== donor.id) return Promise.resolve(null);
        if (args.where.churchId !== donor.churchId) return Promise.resolve(null);
        return Promise.resolve({ ...donor });
      }),
      update: vi.fn((args: any) => {
        Object.assign(donor, args.data);
        return Promise.resolve({ ...donor });
      }),
    },
    externalDonationAuditLog: { create: vi.fn() },
    dashboardAuditLog: {
      create: vi.fn((args: any) => {
        auditLogs.push(args.data);
        return Promise.resolve(args.data);
      }),
    },
  };
  return { prismaMock, auditLogs, donor };
}

async function loadModule(prismaMock: any) {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  return import("@/lib/donors/donorAddress");
}

const NEW_ADDRESS = { addressLine1: "456 Oak St", addressLine2: null, city: "Springfield", state: "IL", postalCode: "62704", country: "US" };

describe("applyDonorAddressUpdate", () => {
  beforeEach(() => vi.resetModules());

  it("writes directly when the donor has no existing address", async () => {
    const { prismaMock, donor } = makePrismaMock(makeDonor());
    const { applyDonorAddressUpdate } = await loadModule(prismaMock);

    const result = await applyDonorAddressUpdate({
      donorId: "donor-1",
      churchId: "church-A",
      newAddress: NEW_ADDRESS,
      source: "MERCHANT_MANUAL_ENTRY",
      enteredByDonor: false,
      actorUserId: "user-1",
    });

    expect(result.status).toBe("updated");
    expect(donor.addressLine1).toBe("456 Oak St");
    expect(donor.addressSource).toBe("MERCHANT_MANUAL_ENTRY");
    expect(donor.addressVerified).toBe("UNVERIFIED");
  });

  it("returns needs_confirmation instead of overwriting a different existing address when merchant/import-entered", async () => {
    const { prismaMock, donor } = makePrismaMock(makeDonor({ addressLine1: "123 Main St", city: "Chicago", state: "IL", postalCode: "60601" }));
    const { applyDonorAddressUpdate } = await loadModule(prismaMock);

    const result = await applyDonorAddressUpdate({
      donorId: "donor-1",
      churchId: "church-A",
      newAddress: NEW_ADDRESS,
      source: "CSV_IMPORT",
      enteredByDonor: false,
      actorUserId: "user-1",
    });

    expect(result.status).toBe("needs_confirmation");
    // The original address must be untouched.
    expect(donor.addressLine1).toBe("123 Main St");
  });

  it("allows a donor-entered address to replace an existing different address directly", async () => {
    const { prismaMock, donor } = makePrismaMock(makeDonor({ addressLine1: "123 Main St", city: "Chicago", state: "IL", postalCode: "60601" }));
    const { applyDonorAddressUpdate } = await loadModule(prismaMock);

    const result = await applyDonorAddressUpdate({
      donorId: "donor-1",
      churchId: "church-A",
      newAddress: NEW_ADDRESS,
      source: "ONLINE_DONATION_FORM",
      enteredByDonor: true,
      verifiedAs: "CONFIRMED_BY_DONOR",
    });

    expect(result.status).toBe("updated");
    expect(donor.addressLine1).toBe("456 Oak St");
    expect(donor.addressVerified).toBe("CONFIRMED_BY_DONOR");
    expect(donor.lastAddressConfirmedAt).not.toBeNull();
  });

  it("replaces a differing existing address when force is explicitly set (merchant confirmed the warning)", async () => {
    const { prismaMock, donor } = makePrismaMock(makeDonor({ addressLine1: "123 Main St", city: "Chicago", state: "IL", postalCode: "60601" }));
    const { applyDonorAddressUpdate } = await loadModule(prismaMock);

    const result = await applyDonorAddressUpdate({
      donorId: "donor-1",
      churchId: "church-A",
      newAddress: NEW_ADDRESS,
      source: "MERCHANT_MANUAL_ENTRY",
      enteredByDonor: false,
      force: true,
      actorUserId: "user-1",
    });

    expect(result.status).toBe("updated");
    expect(donor.addressLine1).toBe("456 Oak St");
  });

  it("reports unchanged and writes nothing when the submitted address matches the existing one exactly", async () => {
    const existing = makeDonor({ addressLine1: "123 Main St", city: "Chicago", state: "IL", postalCode: "60601", country: "US" });
    const { prismaMock, donor } = makePrismaMock(existing);
    const { applyDonorAddressUpdate } = await loadModule(prismaMock);

    const result = await applyDonorAddressUpdate({
      donorId: "donor-1",
      churchId: "church-A",
      newAddress: { addressLine1: "123 Main St", addressLine2: null, city: "Chicago", state: "IL", postalCode: "60601", country: "US" },
      source: "MERCHANT_MANUAL_ENTRY",
      enteredByDonor: false,
    });

    expect(result.status).toBe("unchanged");
    expect(prismaMock.donor.update).not.toHaveBeenCalled();
  });

  it("records an audit event with the source and never overwrites another donor's record (scoped by churchId + donorId)", async () => {
    const { prismaMock } = makePrismaMock(makeDonor());
    const { applyDonorAddressUpdate } = await loadModule(prismaMock);

    await applyDonorAddressUpdate({
      donorId: "donor-1",
      churchId: "church-A",
      newAddress: NEW_ADDRESS,
      source: "EXTERNAL_DONATION",
      enteredByDonor: false,
      actorUserId: "user-1",
      actorEmail: "staff@church.org",
    });

    expect(prismaMock.dashboardAuditLog.create).toHaveBeenCalledTimes(1);
    const logged = prismaMock.dashboardAuditLog.create.mock.calls[0][0].data;
    expect(logged.action).toBe("donor.address_created");
    expect(logged.metadata.source).toBe("EXTERNAL_DONATION");
    expect(prismaMock.donor.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "donor-1", churchId: "church-A" } }));
  });
});

describe("cross-organization isolation", () => {
  it("refuses to update an address for a donor scoped to a different church", async () => {
    const { prismaMock } = makePrismaMock(makeDonor({ churchId: "church-A" }));
    const { applyDonorAddressUpdate } = await loadModule(prismaMock);

    await expect(
      applyDonorAddressUpdate({
        donorId: "donor-1",
        churchId: "church-B", // attacker/other org guessing a donor ID from a different church
        newAddress: NEW_ADDRESS,
        source: "MERCHANT_MANUAL_ENTRY",
        enteredByDonor: false,
      })
    ).rejects.toThrow("Donor not found");
  });
});

describe("clearDonorAddress", () => {
  it("clears the current address but preserves the previous value in the audit log (never deletes history)", async () => {
    const { prismaMock, donor } = makePrismaMock(makeDonor({ addressLine1: "123 Main St", city: "Chicago", state: "IL", postalCode: "60601", addressVerified: "CONFIRMED_BY_ORG" }));
    const { clearDonorAddress } = await loadModule(prismaMock);

    await clearDonorAddress({ donorId: "donor-1", churchId: "church-A", actorUserId: "user-1" });

    expect(donor.addressLine1).toBeNull();
    expect(donor.addressVerified).toBe("UNVERIFIED");
    const logged = prismaMock.dashboardAuditLog.create.mock.calls[0][0].data;
    expect(logged.action).toBe("donor.address_cleared");
    expect(logged.metadata.previousAddress.addressLine1).toBe("123 Main St");
  });
});

describe("confirmDonorAddress", () => {
  it("never marks an address confirmed merely because it passed validation — only an explicit call sets it", async () => {
    const { prismaMock, donor } = makePrismaMock(makeDonor({ addressLine1: "123 Main St" }));
    const { confirmDonorAddress } = await loadModule(prismaMock);

    expect(donor.addressVerified).toBe("UNVERIFIED");
    await confirmDonorAddress({ donorId: "donor-1", churchId: "church-A", confirmedAs: "CONFIRMED_BY_ORG", actorUserId: "user-1" });
    expect(donor.addressVerified).toBe("CONFIRMED_BY_ORG");
  });

  it("refuses to confirm a donor with no address on file", async () => {
    const { prismaMock } = makePrismaMock(makeDonor());
    const { confirmDonorAddress } = await loadModule(prismaMock);

    await expect(confirmDonorAddress({ donorId: "donor-1", churchId: "church-A", confirmedAs: "CONFIRMED_BY_ORG" })).rejects.toThrow();
  });
});

describe("computeAddressStatus", () => {
  it("classifies missing, unverified, and confirmed correctly", async () => {
    const { prismaMock } = makePrismaMock(makeDonor());
    const { computeAddressStatus } = await loadModule(prismaMock);

    expect(computeAddressStatus({ addressLine1: null, addressVerified: "UNVERIFIED" })).toBe("MISSING");
    expect(computeAddressStatus({ addressLine1: "123 Main St", addressVerified: "UNVERIFIED" })).toBe("UNVERIFIED");
    expect(computeAddressStatus({ addressLine1: "123 Main St", addressVerified: "CONFIRMED_BY_DONOR" })).toBe("CONFIRMED");
    expect(computeAddressStatus({ addressLine1: "123 Main St", addressVerified: "CONFIRMED_BY_ORG" })).toBe("CONFIRMED");
  });
});
