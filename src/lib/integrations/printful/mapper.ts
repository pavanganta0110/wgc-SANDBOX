import type { MerchandiseOrder, MerchandiseProduct, MerchandiseVariant } from "@prisma/client";
import type { ProviderOrderStatus, WgcProduct } from "./types";

/**
 * All translation between provider-shaped data and WGC's Prisma rows lives
 * here. Nothing else should reach into a raw provider object or hand-write
 * this mapping inline (spec item 23/53).
 */

export function mapProductToUpsertData(product: WgcProduct, churchId: string, provider = "PRINTFUL") {
  return {
    churchId,
    provider,
    externalProductId: product.externalProductId,
    name: product.name,
    description: product.description,
    thumbnailUrl: product.thumbnailUrl,
    primaryImageUrl: product.primaryImageUrl,
    currency: product.currency,
    externalCreatedAt: product.externalCreatedAt ?? null,
    externalUpdatedAt: product.externalUpdatedAt ?? null,
    lastSyncedAt: new Date(),
    syncStatus: "SYNCED" as const,
  };
}

export function mapVariantToUpsertData(variant: WgcProduct["variants"][number], churchId: string, existingMerchantPrice?: number) {
  return {
    churchId,
    externalVariantId: variant.externalVariantId,
    sku: variant.sku,
    name: variant.name,
    size: variant.size,
    color: variant.color,
    imageUrl: variant.imageUrl,
    providerCost: variant.providerCost,
    // Preserve a merchant's own price override across re-sync; only seed
    // from the provider's suggestion the first time a variant is created.
    merchantPrice: existingMerchantPrice ?? variant.suggestedRetailPrice,
    currency: variant.currency,
    available: variant.available,
    stockStatus: variant.stockStatus,
    externalDataJson: variant.raw ? JSON.parse(JSON.stringify(variant.raw)) : undefined,
    lastSyncedAt: new Date(),
  };
}

/** Provider status -> WGC's internal MerchandiseOrder.status/fulfillmentStatus vocabulary. */
export function mapProviderOrderStatusToWgc(status: ProviderOrderStatus): { status: string; fulfillmentStatus: string } {
  switch (status) {
    case "DRAFT":
      return { status: "FULFILLMENT_PENDING", fulfillmentStatus: "PENDING" };
    case "PENDING":
      return { status: "SUBMITTED", fulfillmentStatus: "PENDING" };
    case "IN_FULFILLMENT":
      return { status: "IN_FULFILLMENT", fulfillmentStatus: "IN_PROGRESS" };
    case "PARTIALLY_FULFILLED":
      return { status: "PARTIALLY_FULFILLED", fulfillmentStatus: "PARTIALLY_FULFILLED" };
    case "FULFILLED":
      return { status: "IN_FULFILLMENT", fulfillmentStatus: "FULFILLED" };
    case "SHIPPED":
      return { status: "SHIPPED", fulfillmentStatus: "FULFILLED" };
    case "DELIVERED":
      return { status: "DELIVERED", fulfillmentStatus: "FULFILLED" };
    case "CANCELLED":
      return { status: "CANCELLED", fulfillmentStatus: "CANCELLED" };
    case "FAILED":
      return { status: "FAILED", fulfillmentStatus: "FAILED" };
    default:
      return { status: "SUBMITTED", fulfillmentStatus: "PENDING" };
  }
}

export function productToPublicShape(product: MerchandiseProduct & { variants: MerchandiseVariant[] }, priceOverride?: number | null) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.primaryImageUrl || product.thumbnailUrl,
    currency: product.currency,
    variants: product.variants
      .filter((v) => v.active)
      .map((v) => ({
        id: v.id,
        externalVariantId: v.externalVariantId,
        name: v.name,
        size: v.size,
        color: v.color,
        imageUrl: v.imageUrl,
        price: priceOverride ?? v.merchantPrice,
        available: v.available && v.stockStatus !== "OUT_OF_STOCK" && v.stockStatus !== "DISCONTINUED",
        stockStatus: v.stockStatus,
      })),
  };
}

export function orderToDetailShape(order: MerchandiseOrder & { items: any[] }) {
  return {
    id: order.id,
    wgcOrderNumber: order.wgcOrderNumber,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shipping: {
      name: order.shippingName,
      address1: order.shippingAddress1,
      address2: order.shippingAddress2,
      city: order.shippingCity,
      state: order.shippingState,
      postalCode: order.shippingPostalCode,
      country: order.shippingCountry,
    },
    amounts: {
      subtotal: order.subtotal,
      shipping: order.shippingAmount,
      tax: order.taxAmount,
      discount: order.discountAmount,
      total: order.totalMerchandiseAmount,
      currency: order.currency,
    },
    fulfillment: {
      provider: order.provider,
      externalOrderId: order.externalOrderId,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      carrier: order.carrier,
      externalStatus: order.externalStatus,
      failureReason: order.failureReason,
    },
    items: order.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      variantName: i.variantName,
      size: i.size,
      color: i.color,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      imageUrl: i.imageUrl,
    })),
    timeline: {
      placedAt: order.placedAt,
      submittedToProviderAt: order.submittedToProviderAt,
      fulfilledAt: order.fulfilledAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
    },
    createdAt: order.createdAt,
  };
}
