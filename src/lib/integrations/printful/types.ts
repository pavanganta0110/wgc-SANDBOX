/**
 * Internal WGC-shaped types for the Printful/merchandise integration. Every
 * adapter (mock or real) returns exactly these shapes — raw Printful API
 * objects never leak past mapper.ts. See config.ts for env-var handling and
 * provider.ts for the interface both adapters implement.
 */

export type PrintfulConnectionStatus = "NOT_CONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR" | "DISCONNECTED";
export type PrintfulConnectionType = "oauth" | "private_token" | "mock";

export interface WgcAddress {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string | null;
  email?: string | null;
}

export interface WgcVariant {
  externalVariantId: string;
  // The underlying Printful catalog variant id — distinct from
  // externalVariantId (this sync product's own store-specific id). Needed
  // specifically for the shipping-rates endpoint; see MerchandiseVariant's
  // schema comment for how this was confirmed.
  catalogVariantId: string | null;
  sku: string | null;
  name: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  providerCost: number; // cents
  suggestedRetailPrice: number; // cents — provider's suggestion; WGC's own merchantPrice is set separately
  currency: string;
  available: boolean;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "DISCONTINUED";
  raw?: unknown; // stored in MerchandiseVariant.externalDataJson, never trusted beyond display
}

export interface WgcProduct {
  externalProductId: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  primaryImageUrl: string | null;
  currency: string;
  variants: WgcVariant[];
  externalCreatedAt?: Date | null;
  externalUpdatedAt?: Date | null;
}

export interface ShippingRateRequest {
  address: Pick<WgcAddress, "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country">;
  items: { externalVariantId: string; catalogVariantId: string | null; quantity: number }[];
}

export interface ShippingRateOption {
  id: string;
  name: string;
  rate: number; // cents
  currency: string;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
}

export interface CreateProviderOrderItem {
  externalVariantId: string;
  quantity: number;
  // Snapshot fields passed through for mock realism / provider order line
  // description — never used for pricing (WGC always prices server-side).
  productName: string;
  variantName: string | null;
}

export interface CreateProviderOrderInput {
  externalOrderReference: string; // WGC's own wgcOrderNumber — used as the provider-side idempotency/external reference
  recipient: WgcAddress;
  items: CreateProviderOrderItem[];
  shippingOptionId?: string | null;
}

export type ProviderOrderStatus =
  | "DRAFT"
  | "PENDING"
  | "IN_FULFILLMENT"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED";

export interface ProviderOrder {
  externalOrderId: string;
  status: ProviderOrderStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  raw?: unknown;
}

export interface ProviderConnectionInfo {
  connected: boolean;
  storeId: string | null;
  accountId: string | null;
  connectionType: PrintfulConnectionType;
  scopes: string[] | null;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  checkedAt: Date;
}

export interface ParsedWebhookEvent {
  externalEventId: string;
  eventType: WgcMerchandiseWebhookEventType;
  externalOrderId?: string | null;
  status?: ProviderOrderStatus | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  carrier?: string | null;
  raw: unknown;
}

/**
 * WGC-internal event taxonomy — deliberately NOT identical to whatever
 * Printful's real webhook event names turn out to be (undocumented until
 * real credentials/API access are confirmed, see spec item 45). The real
 * adapter's mapper.ts is the only place that translates Printful's actual
 * event strings into this closed set.
 */
export type WgcMerchandiseWebhookEventType =
  | "ORDER_UPDATED"
  | "ORDER_FAILED"
  | "FULFILLMENT_STARTED"
  | "SHIPMENT_CREATED"
  | "SHIPMENT_UPDATED"
  | "ORDER_CANCELLED"
  | "PRODUCT_UPDATED"
  | "STOCK_UPDATED"
  | "UNKNOWN";
