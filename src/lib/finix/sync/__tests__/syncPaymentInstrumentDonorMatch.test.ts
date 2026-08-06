import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFinixClient = { getPaymentInstrument: vi.fn() };
vi.mock("@/lib/finix/client", () => ({ finixClient: mockFinixClient }));

const mockUpsertDonorFromIdentity = vi.fn();
vi.mock("@/lib/finix/sync/syncDonor", () => ({ upsertDonorFromIdentity: (identity: string, churchId: string) => mockUpsertDonorFromIdentity(identity, churchId) }));

const mockPrisma = {
  finixPaymentInstrumentSnapshot: { upsert: vi.fn().mockResolvedValue(undefined) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/finix/redact", () => ({ redactFinixPayload: () => ({}) }));

async function load() {
  vi.resetModules();
  return import("@/lib/finix/sync/syncPaymentInstruments");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFinixClient.getPaymentInstrument.mockResolvedValue({ identity: "ID123", enabled: true, brand: "VISA", last_four: "1111" });
  mockUpsertDonorFromIdentity.mockResolvedValue("donor-1");
});

describe("syncPaymentInstrument — donor matching", () => {
  it("upserts a Donor from the instrument's identity when churchId is given and skipDonorMatch is not set (default behavior for donation flows)", async () => {
    const { syncPaymentInstrument } = await load();
    await syncPaymentInstrument("PI123", { churchId: "church-a" });
    expect(mockUpsertDonorFromIdentity).toHaveBeenCalledWith("ID123", "church-a");
    expect(mockPrisma.finixPaymentInstrumentSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ donorId: "donor-1" }) })
    );
  });

  it("never upserts a Donor when skipDonorMatch is true, even with a churchId and a resolvable identity — the invoice-payment call path", async () => {
    const { syncPaymentInstrument } = await load();
    await syncPaymentInstrument("PI123", { churchId: "church-a", skipDonorMatch: true });
    expect(mockUpsertDonorFromIdentity).not.toHaveBeenCalled();
    expect(mockPrisma.finixPaymentInstrumentSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ donorId: null }) })
    );
  });

  it("uses an explicitly-passed donorId as-is and never calls upsertDonorFromIdentity, regardless of skipDonorMatch", async () => {
    const { syncPaymentInstrument } = await load();
    await syncPaymentInstrument("PI123", { churchId: "church-a", donorId: "explicit-donor" });
    expect(mockUpsertDonorFromIdentity).not.toHaveBeenCalled();
    expect(mockPrisma.finixPaymentInstrumentSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ donorId: "explicit-donor" }) })
    );
  });
});
