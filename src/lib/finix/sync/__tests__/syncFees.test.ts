import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFinixClient = { listFeesForTransfer: vi.fn(), fetchByHref: vi.fn() };
vi.mock("@/lib/finix/client", () => ({ finixClient: mockFinixClient }));

const mockPrisma = {
  finixFee: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
  },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/finix/redact", () => ({ redactFinixPayload: (fee: unknown) => fee }));

async function load() {
  vi.resetModules();
  return import("@/lib/finix/sync/syncFees");
}

function fee(overrides: Record<string, unknown>) {
  return {
    id: "FE1",
    fee_type: "CARD_BASIS_POINTS",
    category: "PROCESSOR",
    fee_subtype: null,
    amount: 100,
    currency: "USD",
    linked_id: "TR1",
    linked_to: "TRANSFER",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.finixFee.findUnique.mockResolvedValue(null);
});

describe("syncFeesForTransfer", () => {
  it("captures category and feeSubtype as their own fields, alongside the existing feeType", async () => {
    mockFinixClient.listFeesForTransfer.mockResolvedValue({
      _embedded: { fees: [fee({ id: "FE-interchange", category: "INTERCHANGE", fee_type: "VISA_INTERCHANGE", fee_subtype: null })] },
    });
    const { syncFeesForTransfer } = await load();
    await syncFeesForTransfer("TR1", "church-1");

    expect(mockPrisma.finixFee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ category: "INTERCHANGE", feeSubtype: null, feeType: "VISA_INTERCHANGE" }),
      })
    );
  });

  it("captures feeSubtype PLATFORM_FEE distinctly, even when feeType doesn't contain APPLICATION — the exact row shape that broke the old exclusion heuristic", async () => {
    mockFinixClient.listFeesForTransfer.mockResolvedValue({
      _embedded: { fees: [fee({ id: "FE-platform", fee_type: "CARD_BASIS_POINTS", category: "PROCESSOR", fee_subtype: "PLATFORM_FEE" })] },
    });
    const { syncFeesForTransfer } = await load();
    await syncFeesForTransfer("TR1", "church-1");

    expect(mockPrisma.finixFee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ feeSubtype: "PLATFORM_FEE" }) })
    );
  });

  it("follows HAL _links.next to fetch every page of fees for a transfer with more line items than fit on one page", async () => {
    mockFinixClient.listFeesForTransfer.mockResolvedValue({
      _embedded: { fees: [fee({ id: "FE-page1" })] },
      _links: { next: { href: "https://finix.example.com/fees?linked_to=TR1&offset=1" } },
    });
    mockFinixClient.fetchByHref.mockResolvedValue({
      _embedded: { fees: [fee({ id: "FE-page2" })] },
    });

    const { syncFeesForTransfer } = await load();
    const result = await syncFeesForTransfer("TR1", "church-1");

    expect(mockFinixClient.fetchByHref).toHaveBeenCalledWith("https://finix.example.com/fees?linked_to=TR1&offset=1");
    expect(mockPrisma.finixFee.upsert).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);
  });

  it("stops paginating once a page has no _links.next", async () => {
    mockFinixClient.listFeesForTransfer.mockResolvedValue({
      _embedded: { fees: [fee({ id: "FE-only" })] },
    });
    const { syncFeesForTransfer } = await load();
    await syncFeesForTransfer("TR1", "church-1");

    expect(mockFinixClient.fetchByHref).not.toHaveBeenCalled();
    expect(mockPrisma.finixFee.upsert).toHaveBeenCalledTimes(1);
  });
});
