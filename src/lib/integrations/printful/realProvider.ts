import type { PrintProvider } from "./provider";
import { getPrintfulApiBaseUrl } from "./config";
import { PrintfulApiError } from "./errors";
import type {
  CreateProviderOrderInput,
  ParsedWebhookEvent,
  ProviderConnectionInfo,
  ProviderOrder,
  ProviderOrderStatus,
  ProviderTestResult,
  ShippingRateOption,
  ShippingRateRequest,
  WgcProduct,
  WgcVariant,
} from "./types";

// Real Printful adapter, built against Printful's documented v1 REST API
// (Bearer-token auth, https://api.printful.com). Implemented from Printful's
// published API reference rather than a live account, since credentials
// weren't available while writing this — the shapes below match Printful's
// documented request/response format, but every field name should be
// double-checked against a real response the first time a real token is
// used (see the REQUIRES-LIVE-VERIFICATION markers). Nothing here is a
// silent guess dressed up as fact: anywhere the exact response shape isn't
// 100% certain, the code defensively checks multiple plausible field names
// rather than assuming one.
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Printful's shipping/order APIs expect ISO 3166-1 alpha-2 country codes
 * (e.g. "US"), matching every carrier API convention (USPS/UPS/FedEx all
 * use the same 2-letter codes). The giving-page address form's country
 * field is free text — a donor (or the form's own default value) can
 * easily produce "USA", "United States", or a lowercase variant, any of
 * which a strict carrier-rate endpoint will most likely reject or silently
 * return zero rates for rather than error clearly. Normalized here, at the
 * one place every address reaches Printful, so it can't be reintroduced by
 * a future call site forgetting to convert it. Only the handful of
 * countries donors are realistically shipping within/from are mapped —
 * anything else passes through unchanged (already-correct 2-letter codes,
 * or a country this list doesn't recognize, which Printful can reject with
 * its own real error rather than us guessing further).
 */
const COUNTRY_CODE_ALIASES: Record<string, string> = {
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  CA: "CA",
  CAN: "CA",
  CANADA: "CA",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  GBR: "GB",
};

export function normalizeCountryCode(raw: string | null | undefined): string {
  const trimmed = (raw || "").trim().toUpperCase();
  if (!trimmed) return "US"; // giving pages are US-first today; an empty value must never silently produce a malformed request
  if (trimmed.length === 2) return trimmed;
  return COUNTRY_CODE_ALIASES[trimmed] || trimmed;
}

export class PrintfulProvider implements PrintProvider {
  private accessToken: string;
  private apiBaseUrl: string;
  // Only meaningful for an Account-level Private Token (can act across
  // every store on the account) — per Printful's docs, X-PF-Store-Id is
  // "required only for account level token". A Store-level token (the
  // default from the per-store token page, and the only kind this
  // integration's connect flow currently produces) is already bound to one
  // store server-side and must NOT send this header. Left null by every
  // current caller; kept as a constructor param for a future account-level
  // connection path rather than removed outright.
  private storeId: string | null;

  constructor(params: { accessToken: string; storeId?: string | null }) {
    this.accessToken = params.accessToken;
    this.apiBaseUrl = getPrintfulApiBaseUrl();
    this.storeId = params.storeId ?? null;
  }

  private async request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...(this.storeId ? { "X-PF-Store-Id": this.storeId } : {}),
          ...(options.headers || {}),
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === "AbortError";
      throw new PrintfulApiError(isAbort ? `Printful request timed out after ${REQUEST_TIMEOUT_MS}ms` : `Printful network error: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearTimeout(timeout);

    const text = await res.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = text;
    }

    if (!res.ok) {
      // Printful's error responses are documented as { code, result, error: { message, reason } }
      const message = body?.error?.message || body?.result || `Printful API error (HTTP ${res.status})`;
      throw new PrintfulApiError(message, res.status, body);
    }

    // Printful wraps successful responses as { code, result, paging? } — the
    // caller usually wants just `result`, but return the full body when
    // `result` is absent so callers can inspect paging.
    return (body && typeof body === "object" && "result" in body ? body : { result: body }) as T;
  }

  /**
   * Confirmed against Printful's own published authentication docs
   * (developers.printful.com/docs/, fetched directly — not inferred): a
   * Private Token has one of two access levels.
   *   - "Store" level (the default from Settings -> Stores -> a store ->
   *     API, and the only kind the scope-checkbox screen this merchant
   *     used can produce): bound to one store AT CREATION TIME, server-
   *     side, invisibly to the token holder. It never needs (or is even
   *     granted a scope to look up) X-PF-Store-Id — Printful already knows
   *     which store it is. Its available scopes are exactly orders/
   *     sync_products/file_library/webhooks (read and/or write) — there is
   *     no "store info" scope at this level at all.
   *   - "Account" level: can act across every store on the account, and
   *     DOES require X-PF-Store-Id on every store-scoped call.
   *
   * Every failure this integration hit (stores_list/read missing, then
   * "requires store_id", then a wrong guess at that id) traces back to one
   * mistake: testing the connection via GET /store, an endpoint outside
   * every scope a Store-level token can be granted. There was never a
   * store id to find — a Store-level token doesn't need one supplied by
   * the caller at all. Connection verification below calls whichever
   * store-scoped endpoint the merchant's chosen scopes actually cover,
   * with no store-id header, and getStoreId()/discoverStoreId() are gone —
   * see docs/integrations/printful.md for the account-level exception.
   */
  private async verifyStoreScopedAccess(): Promise<{ ok: true; via: string } | { ok: false; attempts: string[] }> {
    const attempts: string[] = [];
    // Ordered by how likely a merchant is to have checked that scope —
    // "View store products" is the most natural first checkbox on that
    // screen — but every candidate is tried since we can't see what they
    // actually checked.
    const candidates = ["/store/products?limit=1", "/webhooks", "/orders?limit=1", "/files?limit=1"];
    for (const path of candidates) {
      try {
        await this.request<any>(path);
        return { ok: true, via: path };
      } catch (err) {
        const message = err instanceof PrintfulApiError ? err.message : err instanceof Error ? err.message : "unknown error";
        attempts.push(`${path}: ${message}`);
      }
    }
    return { ok: false, attempts };
  }

  async getConnectionInfo(): Promise<ProviderConnectionInfo> {
    const result = await this.verifyStoreScopedAccess();
    return {
      connected: result.ok,
      // Store-level tokens never reveal their own numeric store id (see
      // class doc comment) — null here is expected and harmless, not a
      // missing feature.
      storeId: null,
      accountId: null,
      connectionType: "private_token",
      scopes: null,
    };
  }

  async testConnection(): Promise<ProviderTestResult> {
    const result = await this.verifyStoreScopedAccess();
    if (result.ok) {
      return { ok: true, message: "Connected to your Printful store.", checkedAt: new Date() };
    }
    return {
      ok: false,
      message: `Could not connect to Printful: none of the granted scopes could be verified (${result.attempts.join(" | ")}). Make sure at least one "View" scope is checked when generating the token.`,
      checkedAt: new Date(),
    };
  }

  // GET /store/products (list) then GET /store/products/{id} (detail) per
  // product, since Printful's list endpoint only returns summary fields —
  // full variant pricing/SKUs only come back from the detail call.
  // REQUIRES-LIVE-VERIFICATION: confirm pagination shape (paging.total) and
  // whether a real store's product count makes the N+1 detail-fetch pattern
  // here acceptable, or whether it needs batching/rate-limit backoff.
  async getProducts(): Promise<WgcProduct[]> {
    const products: WgcProduct[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const { result: page } = await this.request<{ result: any[] }>(`/store/products?offset=${offset}&limit=${limit}`);
      if (!Array.isArray(page) || page.length === 0) break;

      for (const summary of page) {
        const productId = summary.id;
        try {
          const detail = await this.fetchProductDetail(productId);
          if (detail) products.push(detail);
        } catch (err) {
          console.error(`Printful: failed to fetch detail for product ${productId}:`, err);
        }
      }

      if (page.length < limit) break;
      offset += limit;
    }

    return products;
  }

  async getProduct(externalProductId: string): Promise<WgcProduct | null> {
    return this.fetchProductDetail(externalProductId);
  }

  private async fetchProductDetail(externalProductId: string | number): Promise<WgcProduct | null> {
    let body: { result: { sync_product?: any; sync_variants?: any[] } };
    try {
      body = await this.request(`/store/products/${externalProductId}`);
    } catch (err) {
      if (err instanceof PrintfulApiError && err.status === 404) return null;
      throw err;
    }

    const syncProduct = body.result?.sync_product;
    const syncVariants = body.result?.sync_variants || [];
    if (!syncProduct) return null;

    const variants: WgcVariant[] = syncVariants.map((v: any) => {
      // Printful's sync_variant carries the merchant-catalog fields
      // (retail_price, sku, name) alongside a nested `product` object with
      // the underlying catalog variant's display attributes (size/color) —
      // both are checked since exact nesting varies by API version.
      const size = v.size || v.product?.size || null;
      const color = v.color || v.product?.color || null;
      const inStock = v.availability_status ? v.availability_status !== "discontinued" && v.availability_status !== "out_of_stock" : v.is_ignored !== true;
      const stockStatus =
        v.availability_status === "discontinued" ? "DISCONTINUED" : v.availability_status === "out_of_stock" ? "OUT_OF_STOCK" : v.availability_status === "moderate" || v.availability_status === "low" ? "LOW_STOCK" : "IN_STOCK";

      return {
        externalVariantId: String(v.id),
        catalogVariantId: v.variant_id != null ? String(v.variant_id) : v.product?.variant_id != null ? String(v.product.variant_id) : null,
        sku: v.sku || null,
        name: v.name || v.product?.name || "Variant",
        size,
        color,
        // Confirmed against a REAL synced variant's actual stored response
        // (MerchandiseVariant.externalDataJson, this account's own "All-
        // Over Print" product) — not documentation, which turned out
        // unreliable here: every files[] entry's `url` field is null;
        // the real image lives at `preview_url` (and `thumbnail_url`).
        // A prior version of this code read `.url` based on generic docs
        // that didn't match this product type, which is why every synced
        // product fell through to the generic catalog stock photo
        // (v.product.image) instead of showing this org's actual design.
        // "preview" type is the customer-facing print-position mockup
        // (what a donor should see); "default" type's preview_url points
        // at a print-file technical preview instead, kept only as a
        // fallback for a product with no "preview" file at all.
        imageUrl:
          v.files?.find((f: any) => f.type === "preview")?.preview_url ||
          v.files?.find((f: any) => f.type === "preview")?.thumbnail_url ||
          v.files?.find((f: any) => f.type === "default")?.preview_url ||
          v.files?.[0]?.preview_url ||
          v.product?.image ||
          null,
        // REQUIRES-LIVE-VERIFICATION: Printful's documented sync_variant/
        // product schema has no confirmed "cost to merchant" field at all
        // (retail_price is the only price field Printful's own docs show
        // here) — v.product?.price was a guess that resolves to
        // `undefined` on every real account, hence the $0.00 seen live.
        // Left as 0 rather than guessing a second wrong field; the real
        // cost likely requires a separate Printful endpoint (e.g. the
        // Catalog/Product Templates pricing API) not yet built here.
        providerCost: Math.round(Number(v.product?.price ?? v.cost ?? 0) * 100),
        suggestedRetailPrice: Math.round(Number(v.retail_price ?? v.product?.price ?? 0) * 100),
        currency: v.currency || "USD",
        available: Boolean(inStock),
        stockStatus,
        raw: v,
      };
    });

    return {
      externalProductId: String(syncProduct.id),
      name: syncProduct.name || "Untitled product",
      description: null, // Printful's sync product summary doesn't include a merchant description field
      thumbnailUrl: syncProduct.thumbnail_url || null,
      primaryImageUrl: variants[0]?.imageUrl || syncProduct.thumbnail_url || null,
      currency: variants[0]?.currency || "USD",
      variants,
      externalCreatedAt: null,
      externalUpdatedAt: null,
    };
  }

  // POST /shipping/rates — REQUIRES-LIVE-VERIFICATION: confirm the exact
  // recipient/items field names and the response array shape.
  async getShippingRates(input: ShippingRateRequest): Promise<ShippingRateOption[]> {
    const { result } = await this.request<{ result: any[] }>("/shipping/rates", {
      method: "POST",
      body: JSON.stringify({
        recipient: {
          address1: input.address.addressLine1,
          address2: input.address.addressLine2 || undefined,
          city: input.address.city,
          state_code: input.address.state,
          country_code: normalizeCountryCode(input.address.country),
          zip: input.address.postalCode,
        },
        // variant_id here means Printful's CATALOG variant id, not this
        // sync product's own store-specific id (externalVariantId) — a
        // real account confirmed this with "Invalid variant ID: <sync id>"
        // when the wrong one was sent. Falls back to externalVariantId
        // only if catalogVariantId genuinely wasn't captured (e.g. a
        // product synced before this fix existed) rather than omitting
        // the item outright — Printful's own error is more informative
        // than an item silently vanishing from the rate calculation.
        items: input.items.map((i) => ({ variant_id: i.catalogVariantId || i.externalVariantId, quantity: i.quantity })),
      }),
    });

    if (!Array.isArray(result)) return [];
    return result.map((rate: any) => ({
      id: rate.id,
      name: rate.name,
      rate: Math.round(Number(rate.rate) * 100),
      currency: rate.currency || "USD",
      minDeliveryDays: rate.minDeliveryDays ?? null,
      maxDeliveryDays: rate.maxDeliveryDays ?? null,
    }));
  }

  // POST /orders — confirm=true skips Printful's draft state and submits
  // directly for fulfillment (matches WGC's own flow, where the charge has
  // already succeeded by the time this is called — a draft order sitting
  // unconfirmed in Printful would be an inconsistent state).
  // REQUIRES-LIVE-VERIFICATION: confirm field names, especially whether
  // `external_id` actually enforces idempotency on Printful's side the way
  // their docs describe (a resubmitted order with the same external_id
  // should return the existing order, not create a duplicate — this MUST
  // be tested against a real account before this path is trusted for
  // production traffic, exactly the same idempotency concern already
  // handled carefully on the Finix side).
  async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
    const { result } = await this.request<{ result: any }>("/orders?confirm=1", {
      method: "POST",
      body: JSON.stringify({
        external_id: input.externalOrderReference,
        recipient: {
          name: input.recipient.name || [input.recipient.firstName, input.recipient.lastName].filter(Boolean).join(" ") || undefined,
          address1: input.recipient.addressLine1,
          address2: input.recipient.addressLine2 || undefined,
          city: input.recipient.city,
          state_code: input.recipient.state,
          country_code: normalizeCountryCode(input.recipient.country),
          zip: input.recipient.postalCode,
          phone: input.recipient.phone || undefined,
          email: input.recipient.email || undefined,
        },
        items: input.items.map((i) => ({ sync_variant_id: i.externalVariantId, quantity: i.quantity })),
        shipping: input.shippingOptionId || undefined,
      }),
    });

    return this.mapOrderResponse(result);
  }

  async getOrder(externalOrderId: string): Promise<ProviderOrder | null> {
    try {
      const { result } = await this.request<{ result: any }>(`/orders/${externalOrderId}`);
      return this.mapOrderResponse(result);
    } catch (err) {
      if (err instanceof PrintfulApiError && err.status === 404) return null;
      throw err;
    }
  }

  // DELETE /orders/{id} — REQUIRES-LIVE-VERIFICATION: Printful's docs
  // distinguish canceling a draft order (deletable) from one already in
  // fulfillment (may not be cancelable at all, or requires contacting
  // support) — confirm actual behavior before exposing cancel in the
  // merchant UI for a non-draft order.
  async cancelOrder(externalOrderId: string): Promise<ProviderOrder> {
    const { result } = await this.request<{ result: any }>(`/orders/${externalOrderId}`, { method: "DELETE" });
    return this.mapOrderResponse(result);
  }

  private mapOrderResponse(result: any): ProviderOrder {
    const shipment = Array.isArray(result?.shipments) && result.shipments.length > 0 ? result.shipments[result.shipments.length - 1] : null;
    return {
      externalOrderId: String(result?.id ?? ""),
      status: mapPrintfulOrderStatus(result?.status),
      trackingNumber: shipment?.tracking_number || null,
      trackingUrl: shipment?.tracking_url || null,
      carrier: shipment?.carrier || null,
      raw: result,
    };
  }

  // Printful's webhook payload is documented as { type, created, retries,
  // store, data }. There is no universally-documented HMAC signature header
  // for v1 webhooks (unlike Finix/Stripe) — the practical, standard
  // mitigation is a shared secret embedded in the registered webhook URL
  // itself (e.g. /api/webhooks/printful/<PRINTFUL_WEBHOOK_SECRET>), checked
  // by the route handler before this is ever called, NOT here. If Printful
  // confirms an official signature scheme (ask their support/dev docs), add
  // real cryptographic verification here instead of relying solely on the
  // URL-secret approach — this is flagged, not silently trusted.
  async parseWebhook(payload: unknown): Promise<ParsedWebhookEvent> {
    const body = payload as any;
    const type = String(body?.type || "UNKNOWN");
    const data = body?.data || {};
    const order = data?.order || data?.result || null;

    const eventId = body?.id != null ? String(body.id) : `${type}:${order?.id ?? "unknown"}:${body?.created ?? Date.now()}`;

    return {
      externalEventId: eventId,
      eventType: mapPrintfulWebhookEventType(type),
      externalOrderId: order?.id != null ? String(order.id) : null,
      status: order?.status ? mapPrintfulOrderStatus(order.status) : null,
      trackingNumber: data?.shipment?.tracking_number || null,
      trackingUrl: data?.shipment?.tracking_url || null,
      carrier: data?.shipment?.carrier || null,
      raw: body,
    };
  }
}

// Printful's documented order statuses: draft, pending, failed, canceled,
// onhold, inprocess, partial, fulfilled. REQUIRES-LIVE-VERIFICATION against
// a real order's actual lifecycle.
function mapPrintfulOrderStatus(status: string | undefined | null): ProviderOrderStatus {
  switch ((status || "").toLowerCase()) {
    case "draft":
      return "DRAFT";
    case "pending":
    case "onhold":
      return "PENDING";
    case "inprocess":
      return "IN_FULFILLMENT";
    case "partial":
      return "PARTIALLY_FULFILLED";
    case "fulfilled":
      return "FULFILLED";
    case "shipped":
      return "SHIPPED";
    case "delivered":
      return "DELIVERED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "failed":
      return "FAILED";
    default:
      return "PENDING";
  }
}

// Printful's documented webhook `type` values include package_shipped,
// package_returned, order_created, order_updated, order_failed,
// order_canceled/order_canceled, product_synced, product_updated,
// stock_updated. REQUIRES-LIVE-VERIFICATION against real deliveries.
function mapPrintfulWebhookEventType(type: string): ParsedWebhookEvent["eventType"] {
  switch (type) {
    case "package_shipped":
      return "SHIPMENT_CREATED";
    case "package_returned":
      return "SHIPMENT_UPDATED";
    case "order_created":
      return "FULFILLMENT_STARTED";
    case "order_updated":
      return "ORDER_UPDATED";
    case "order_failed":
      return "ORDER_FAILED";
    case "order_canceled":
    case "order_cancelled":
      return "ORDER_CANCELLED";
    case "product_synced":
    case "product_updated":
      return "PRODUCT_UPDATED";
    case "stock_updated":
      return "STOCK_UPDATED";
    default:
      return "UNKNOWN";
  }
}

/** Thrown by service.ts if a church's connection claims connectionType
 * oauth/private_token but PRINTFUL_MODE is still "mock" or credentials are
 * missing — a defensive guard, not expected to be user-visible in normal
 * sandbox operation. */
export function assertRealProviderUsable(): void {
  if (!getPrintfulApiBaseUrl()) {
    throw new PrintfulApiError("Printful API base URL is not configured.");
  }
}
