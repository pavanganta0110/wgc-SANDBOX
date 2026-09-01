import type { WgcProduct, WgcVariant } from "./types";

/**
 * Deterministic mock Printful catalog — same 3 products/variants for every
 * church in mock mode (spec item 20/68). Prices/costs are illustrative
 * sandbox values, not real Printful pricing. Images are placeholder
 * data-URI-free remote URLs (a neutral placeholder image service) so
 * nothing depends on real Printful CDN assets.
 */

const PLACEHOLDER = (label: string, bg: string) => `https://placehold.co/600x600/${bg}/ffffff?text=${encodeURIComponent(label)}`;

function variant(params: {
  id: string;
  name: string;
  size?: string;
  color?: string;
  providerCost: number;
  suggestedRetailPrice: number;
  imageUrl: string;
  stockStatus?: WgcVariant["stockStatus"];
  available?: boolean;
}): WgcVariant {
  return {
    externalVariantId: params.id,
    catalogVariantId: params.id, // mock data — no distinct catalog id to model
    sku: `MOCK-${params.id}`,
    name: params.name,
    size: params.size ?? null,
    color: params.color ?? null,
    imageUrl: params.imageUrl,
    providerCost: params.providerCost,
    suggestedRetailPrice: params.suggestedRetailPrice,
    currency: "USD",
    available: params.available ?? true,
    stockStatus: params.stockStatus ?? "IN_STOCK",
  };
}

export function getMockCatalog(): WgcProduct[] {
  const shirtBlack = PLACEHOLDER("Ministry Tee - Black", "1f2937");
  const shirtWhite = PLACEHOLDER("Ministry Tee - White", "e5e7eb");
  const hoodie = PLACEHOLDER("Ministry Hoodie", "374151");
  const hat = PLACEHOLDER("Church Hat", "b45309");

  const shirt: WgcProduct = {
    externalProductId: "mock-product-tshirt",
    name: "WGC Ministry T-Shirt",
    description: "Soft cotton-blend tee. Sandbox mock product — not a real Printful catalog item.",
    thumbnailUrl: shirtBlack,
    primaryImageUrl: shirtBlack,
    currency: "USD",
    variants: [
      variant({ id: "mock-tshirt-s-black", name: "Small / Black", size: "S", color: "Black", providerCost: 1050, suggestedRetailPrice: 2500, imageUrl: shirtBlack }),
      variant({ id: "mock-tshirt-m-black", name: "Medium / Black", size: "M", color: "Black", providerCost: 1050, suggestedRetailPrice: 2500, imageUrl: shirtBlack }),
      variant({ id: "mock-tshirt-l-black", name: "Large / Black", size: "L", color: "Black", providerCost: 1050, suggestedRetailPrice: 2500, imageUrl: shirtBlack }),
      variant({ id: "mock-tshirt-xl-black", name: "XL / Black", size: "XL", color: "Black", providerCost: 1150, suggestedRetailPrice: 2500, imageUrl: shirtBlack }),
      variant({ id: "mock-tshirt-s-white", name: "Small / White", size: "S", color: "White", providerCost: 1050, suggestedRetailPrice: 2500, imageUrl: shirtWhite }),
      variant({ id: "mock-tshirt-m-white", name: "Medium / White", size: "M", color: "White", providerCost: 1050, suggestedRetailPrice: 2500, imageUrl: shirtWhite }),
      variant({ id: "mock-tshirt-l-white", name: "Large / White", size: "L", color: "White", providerCost: 1050, suggestedRetailPrice: 2500, imageUrl: shirtWhite }),
      variant({ id: "mock-tshirt-xl-white", name: "XL / White", size: "XL", color: "White", providerCost: 1150, suggestedRetailPrice: 2500, imageUrl: shirtWhite, stockStatus: "LOW_STOCK" }),
    ],
  };

  const hoodieProduct: WgcProduct = {
    externalProductId: "mock-product-hoodie",
    name: "Ministry Hoodie",
    description: "Heavyweight fleece hoodie. Sandbox mock product.",
    thumbnailUrl: hoodie,
    primaryImageUrl: hoodie,
    currency: "USD",
    variants: [
      variant({ id: "mock-hoodie-s", name: "Small", size: "S", providerCost: 2200, suggestedRetailPrice: 4500, imageUrl: hoodie }),
      variant({ id: "mock-hoodie-m", name: "Medium", size: "M", providerCost: 2200, suggestedRetailPrice: 4500, imageUrl: hoodie }),
      variant({ id: "mock-hoodie-l", name: "Large", size: "L", providerCost: 2200, suggestedRetailPrice: 4500, imageUrl: hoodie }),
      variant({ id: "mock-hoodie-xl", name: "XL", size: "XL", providerCost: 2350, suggestedRetailPrice: 4500, imageUrl: hoodie, stockStatus: "OUT_OF_STOCK", available: false }),
    ],
  };

  const hatProduct: WgcProduct = {
    externalProductId: "mock-product-hat",
    name: "Church Hat",
    description: "Adjustable embroidered cap. Sandbox mock product.",
    thumbnailUrl: hat,
    primaryImageUrl: hat,
    currency: "USD",
    variants: [variant({ id: "mock-hat-one-size", name: "One Size", providerCost: 950, suggestedRetailPrice: 2200, imageUrl: hat })],
  };

  return [shirt, hoodieProduct, hatProduct];
}

export function findMockVariant(externalVariantId: string): { product: WgcProduct; variant: WgcVariant } | null {
  for (const product of getMockCatalog()) {
    const variant = product.variants.find((v) => v.externalVariantId === externalVariantId);
    if (variant) return { product, variant };
  }
  return null;
}
