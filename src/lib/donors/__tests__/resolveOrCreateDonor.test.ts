import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeDonor {
  id: string;
  churchId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  finixIdentityId: string | null;
  archivedAt: Date | null;
}

function makePrismaMock(seed: FakeDonor[] = []) {
  const donors = [...seed];
  let nextId = 1;

  const donor = {
    findFirst: vi.fn((args: any) => {
      const where = args.where;
      const match = donors.find((d) => {
        if (where.finixIdentityId !== undefined && d.finixIdentityId !== where.finixIdentityId) return false;
        if (where.normalizedEmail !== undefined && d.normalizedEmail !== where.normalizedEmail) return false;
        if (where.normalizedPhone !== undefined && d.normalizedPhone !== where.normalizedPhone) return false;
        if (where.churchId !== undefined && d.churchId !== where.churchId) return false;
        if (where.archivedAt === null && d.archivedAt !== null) return false;
        return true;
      });
      return Promise.resolve(match ?? null);
    }),
    create: vi.fn((args: any) => {
      const created: FakeDonor = {
        id: `donor-${nextId++}`,
        churchId: args.data.churchId,
        name: args.data.name ?? null,
        email: args.data.email ?? null,
        phone: args.data.phone ?? null,
        normalizedEmail: args.data.normalizedEmail ?? null,
        normalizedPhone: args.data.normalizedPhone ?? null,
        finixIdentityId: args.data.finixIdentityId ?? null,
        archivedAt: null,
      };
      donors.push(created);
      return Promise.resolve(created);
    }),
    update: vi.fn((args: any) => {
      const target = donors.find((d) => d.id === args.where.id)!;
      Object.assign(target, args.data);
      return Promise.resolve(target);
    }),
  };

  return { donor, __donors: donors };
}

async function loadModule(prismaMock: ReturnType<typeof makePrismaMock>) {
  vi.resetModules();
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  return import("@/lib/donors/resolveOrCreateDonor");
}

beforeEach(() => vi.clearAllMocks());

describe("resolveOrCreateDonor — canonical identity", () => {
  it("two donations with the same church and normalized email create one donor", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const first = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_1" });
    const second = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_2" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(prismaMock.__donors.filter((d) => d.churchId === "church-a")).toHaveLength(1);
  });

  it("email matching is case-insensitive", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const first = await resolveOrCreateDonor({ churchId: "church-a", email: "PavanKumarReddi2@gmail.com", finixIdentityId: "ID_1" });
    const second = await resolveOrCreateDonor({ churchId: "church-a", email: "pavankumarreddi2@gmail.com", finixIdentityId: "ID_2" });
    const third = await resolveOrCreateDonor({ churchId: "church-a", email: "pAvAnKuMaRrEdDi2@GmAiL.CoM", finixIdentityId: "ID_3" });

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
  });

  it("leading/trailing spaces are ignored", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const first = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", finixIdentityId: "ID_1" });
    const second = await resolveOrCreateDonor({ churchId: "church-a", email: "  donor@example.com  ", finixIdentityId: "ID_2" });

    expect(second.id).toBe(first.id);
  });

  it("different display names for the same email reuse one donor", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const first = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_1" });
    const second = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "JANE DOE", finixIdentityId: "ID_2" });
    const third = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "J. Doe", finixIdentityId: "ID_3" });

    expect(new Set([first.id, second.id, third.id]).size).toBe(1);
  });

  it("different or missing phone numbers for the same email reuse one donor", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const first = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", phone: "8165551111", finixIdentityId: "ID_1" });
    const second = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", phone: null, finixIdentityId: "ID_2" });
    const third = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", phone: "8165559999", finixIdentityId: "ID_3" });

    expect(new Set([first.id, second.id, third.id]).size).toBe(1);
  });

  it("card/ACH/Apple Pay/Google Pay all resolve through the same shared function and the same normalized email lands on one donor", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const card = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_card" });
    const ach = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_ach" });
    const applePay = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Apple Pay User", finixIdentityId: "ID_apple" });
    const googlePay = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Google Pay User", finixIdentityId: "ID_google" });

    expect(new Set([card.id, ach.id, applePay.id, googlePay.id]).size).toBe(1);
    expect(prismaMock.__donors).toHaveLength(1);
  });

  it("one-time and recurring donations from the same email use the same donor", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const oneTime = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_onetime" });
    const recurring = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_recurring" });

    expect(recurring.id).toBe(oneTime.id);
  });

  it("two churches may each have a donor with the same email — never merged across churches", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const churchA = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", finixIdentityId: "ID_a" });
    const churchB = await resolveOrCreateDonor({ churchId: "church-b", email: "donor@example.com", finixIdentityId: "ID_b" });

    expect(churchA.id).not.toBe(churchB.id);
    expect(prismaMock.__donors).toHaveLength(2);
  });

  it("phone may be used as a fallback identity only when email is unavailable, and only within the same church", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const first = await resolveOrCreateDonor({ churchId: "church-a", phone: "8165551111", finixIdentityId: "ID_1" });
    const second = await resolveOrCreateDonor({ churchId: "church-a", phone: "8165551111", finixIdentityId: "ID_2" });
    const otherChurch = await resolveOrCreateDonor({ churchId: "church-b", phone: "8165551111", finixIdentityId: "ID_3" });

    expect(second.id).toBe(first.id);
    expect(otherChurch.id).not.toBe(first.id);
  });
});

describe("resolveOrCreateDonor — profile update rules", () => {
  it("does not replace a real name with a generic wallet placeholder", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_1" });
    await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Google Pay User", finixIdentityId: "ID_2" });
    await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Apple Pay User", finixIdentityId: "ID_3" });
    await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Card Holder Name", finixIdentityId: "ID_4" });

    expect(prismaMock.__donors[0].name).toBe("Jane Doe");
  });

  it("a meaningful newer name can replace a generic or empty existing name", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Google Pay User", finixIdentityId: "ID_1" });
    const second = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", name: "Jane Doe", finixIdentityId: "ID_2" });

    expect(prismaMock.__donors[0].name).toBe("Jane Doe");
    expect(second.updated).toBe(true);
  });

  it("fills an empty phone when a valid phone is later supplied, without creating a new donor", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    const first = await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", finixIdentityId: "ID_1" });
    await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", phone: "8165551234", finixIdentityId: "ID_2" });

    expect(prismaMock.__donors).toHaveLength(1);
    expect(prismaMock.__donors[0].phone).toBe("8165551234");
    expect(prismaMock.__donors[0].id).toBe(first.id);
  });

  it("never overwrites an already-populated phone with a different one", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", phone: "8165551111", finixIdentityId: "ID_1" });
    await resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", phone: "8165559999", finixIdentityId: "ID_2" });

    expect(prismaMock.__donors[0].phone).toBe("8165551111");
  });
});

describe("resolveOrCreateDonor — concurrency", () => {
  it("two simultaneous donations from a brand-new donor do not create duplicate profiles when the create races on finixIdentityId's unique constraint", async () => {
    const prismaMock = makePrismaMock();
    const { resolveOrCreateDonor } = await loadModule(prismaMock);

    // Simulate a race: both requests miss the initial findFirst (donor
    // doesn't exist yet), then the second create() call collides with the
    // first's now-committed row and throws P2002 — the resolver must
    // recover by re-resolving rather than propagating the error.
    let createCallCount = 0;
    const originalCreate = prismaMock.donor.create.getMockImplementation()!;
    prismaMock.donor.create.mockImplementation((args: any) => {
      createCallCount += 1;
      if (createCallCount === 2) {
        const { Prisma } = require("@prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
      }
      return originalCreate(args);
    });

    const [a, b] = await Promise.all([
      resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", finixIdentityId: "ID_shared" }),
      (async () => {
        // Ensure the second call's create() runs after the first has
        // already inserted its row, so the P2002 retry path actually finds it.
        await new Promise((r) => setTimeout(r, 0));
        return resolveOrCreateDonor({ churchId: "church-a", email: "donor@example.com", finixIdentityId: "ID_shared" });
      })(),
    ]);

    expect(prismaMock.__donors).toHaveLength(1);
    expect(a.id).toBe(b.id);
  });
});
