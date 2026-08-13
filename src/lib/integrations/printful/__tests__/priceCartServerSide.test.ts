import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { merchandiseVariant: { findMany: vi.fn() } },
}));

const CHURCH_A = "church-a";
const GIVING_PAGE = "giving-page-1";

function baseVariant(overrides: Partial<any> = {}) {
  return {
    id: "variant-1",
    churchId: CHURCH_A,
    productId: "product-1",
    externalVariantId: "ext-variant-1",
    name: "Medium / Black",
    size: "M",
    color: "Black",
    sku: "SKU-1",
    imageUrl: null,
    active: true,
    available: true,
    stockStatus: "IN_STOCK",
    merchantPrice: 2500,
    providerCost: 1050,
    product: {
      id: "product-1",
      name: "WGC Ministry T-Shirt",
      active: true,
      givingPageAssignments: [{ givingPageId: GIVING_PAGE, enabled: true, priceOverride: null }],
    },
    ...overrides,
  };
}

describe("priceCartServerSide — server-side price recalculation (spec item 34/62)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes subtotal/providerCost from the DB record, never trusting a client-submitted price", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { priceCartServerSide } = await import("../orderService");
    vi.mocked(prisma.merchandiseVariant.findMany).mockResolvedValue([baseVariant()] as never);

    const result = await priceCartServerSide({ churchId: CHURCH_A, givingPageId: GIVING_PAGE, items: [{ variantId: "variant-1", quantity: 2 }] });

    expect(result.subtotal).toBe(5000); // 2500 * 2 — computed server-side, not from any client input
    expect(result.providerCost).toBe(2100);
    expect(result.items[0].unitPrice).toBe(2500);
  });

  it("applies a GivingPageMerchandise priceOverride instead of the variant's own merchantPrice", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { priceCartServerSide } = await import("../orderService");
    vi.mocked(prisma.merchandiseVariant.findMany).mockResolvedValue([
      baseVariant({ product: { id: "product-1", name: "WGC Ministry T-Shirt", active: true, givingPageAssignments: [{ givingPageId: GIVING_PAGE, enabled: true, priceOverride: 2000 }] } }),
    ] as never);

    const result = await priceCartServerSide({ churchId: CHURCH_A, givingPageId: GIVING_PAGE, items: [{ variantId: "variant-1", quantity: 1 }] });
    expect(result.items[0].unitPrice).toBe(2000);
  });

  it("throws VariantUnavailableError for a variant belonging to a different church (multi-tenant isolation)", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { priceCartServerSide } = await import("../orderService");
    const { VariantUnavailableError } = await import("../errors");
    // findMany scoped by churchId in the real query — simulate the correct
    // behavior of that scoping by returning no rows for a variant that
    // belongs to another church.
    vi.mocked(prisma.merchandiseVariant.findMany).mockResolvedValue([] as never);

    await expect(priceCartServerSide({ churchId: "church-b", givingPageId: GIVING_PAGE, items: [{ variantId: "variant-1", quantity: 1 }] })).rejects.toThrow(VariantUnavailableError);
  });

  it("throws VariantUnavailableError for an out-of-stock variant", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { priceCartServerSide } = await import("../orderService");
    const { VariantUnavailableError } = await import("../errors");
    vi.mocked(prisma.merchandiseVariant.findMany).mockResolvedValue([baseVariant({ stockStatus: "OUT_OF_STOCK", available: false })] as never);

    await expect(priceCartServerSide({ churchId: CHURCH_A, givingPageId: GIVING_PAGE, items: [{ variantId: "variant-1", quantity: 1 }] })).rejects.toThrow(VariantUnavailableError);
  });

  it("throws ProductUnavailableError when the product isn't assigned/enabled on this giving page", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { priceCartServerSide } = await import("../orderService");
    const { ProductUnavailableError } = await import("../errors");
    vi.mocked(prisma.merchandiseVariant.findMany).mockResolvedValue([baseVariant({ product: { id: "product-1", name: "T", active: true, givingPageAssignments: [] } })] as never);

    await expect(priceCartServerSide({ churchId: CHURCH_A, givingPageId: GIVING_PAGE, items: [{ variantId: "variant-1", quantity: 1 }] })).rejects.toThrow(ProductUnavailableError);
  });

  it("rejects an invalid quantity before ever touching the database", async () => {
    const { priceCartServerSide } = await import("../orderService");
    const { OrderSubmissionError } = await import("../errors");
    await expect(priceCartServerSide({ churchId: CHURCH_A, givingPageId: GIVING_PAGE, items: [{ variantId: "variant-1", quantity: 0 }] })).rejects.toThrow(OrderSubmissionError);
    await expect(priceCartServerSide({ churchId: CHURCH_A, givingPageId: GIVING_PAGE, items: [{ variantId: "variant-1", quantity: 26 }] })).rejects.toThrow(OrderSubmissionError);
  });
});
