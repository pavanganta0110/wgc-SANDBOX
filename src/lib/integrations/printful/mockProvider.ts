import crypto from "crypto";
import type { PrintProvider } from "./provider";
import { findMockVariant, getMockCatalog } from "./mockCatalog";
import { ProductUnavailableError, ShippingUnavailableError, VariantUnavailableError } from "./errors";
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
} from "./types";

/**
 * In-memory mock Printful adapter — lets the entire application function
 * with zero real Printful credentials (spec items 5, 22). State (fake
 * orders and their fulfillment status) lives in a module-level Map so it
 * survives across calls within one server process, which is sufficient for
 * sandbox demo/testing; it is NOT durable storage — MerchandiseOrder in
 * Postgres is the durable record, this only backs the "provider" side of
 * the mock order lifecycle (see MockWebhookSimulator in webhooks.ts for how
 * status transitions actually get reflected back into WGC's own tables).
 */

interface MockOrderState {
  externalOrderId: string;
  status: ProviderOrderStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  createdAt: Date;
}

const mockOrders = new Map<string, MockOrderState>();

function randomId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

export class MockPrintfulProvider implements PrintProvider {
  constructor(private churchId: string) {}

  async getConnectionInfo(): Promise<ProviderConnectionInfo> {
    return {
      connected: true,
      storeId: `mock-store-${this.churchId.slice(0, 8)}`,
      accountId: `mock-account-${this.churchId.slice(0, 8)}`,
      connectionType: "mock",
      scopes: ["products:read", "orders:write", "webhooks:manage"],
    };
  }

  async testConnection(): Promise<ProviderTestResult> {
    return { ok: true, message: "Mock connection is healthy.", checkedAt: new Date() };
  }

  async getProducts(): Promise<WgcProduct[]> {
    return getMockCatalog();
  }

  async getProduct(externalProductId: string): Promise<WgcProduct | null> {
    return getMockCatalog().find((p) => p.externalProductId === externalProductId) ?? null;
  }

  async getShippingRates(input: ShippingRateRequest): Promise<ShippingRateOption[]> {
    if (!input.address.postalCode || !input.address.country) {
      throw new ShippingUnavailableError("A complete shipping address is required to calculate rates.");
    }
    if (!input.items.length) {
      throw new ShippingUnavailableError("At least one item is required to calculate shipping.");
    }
    for (const item of input.items) {
      const found = findMockVariant(item.externalVariantId);
      if (!found) throw new VariantUnavailableError();
      if (!found.variant.available) throw new VariantUnavailableError(`${found.variant.name} is currently unavailable.`);
    }
    // Deterministic mock rates — not a real carrier quote (spec item 33).
    return [
      { id: "mock-standard", name: "Standard Shipping", rate: 599, currency: "USD", minDeliveryDays: 5, maxDeliveryDays: 8 },
      { id: "mock-express", name: "Express Shipping", rate: 1299, currency: "USD", minDeliveryDays: 2, maxDeliveryDays: 4 },
    ];
  }

  async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
    if (!input.items.length) throw new ProductUnavailableError("No items in this order.");
    for (const item of input.items) {
      const found = findMockVariant(item.externalVariantId);
      if (!found) throw new VariantUnavailableError();
      if (!found.variant.available) throw new VariantUnavailableError(`${found.variant.name} is currently unavailable.`);
    }

    // Simulate an occasional provider-side failure so the
    // PAYMENT_SUCCESS/FULFILLMENT_PENDING + retry path (spec item 36) is
    // actually exercisable in sandbox without waiting for a real outage.
    // Deterministic based on the order reference (not random) so a given
    // order always fails or always succeeds — makes tests reproducible.
    // Trigger: reference contains the literal string "FORCEFAIL" (used by
    // tests / the mock webhook tester), never occurs in a normal
    // auto-generated wgcOrderNumber.
    if (input.externalOrderReference.includes("FORCEFAIL")) {
      throw new Error("Mock Printful: simulated order submission failure.");
    }

    const externalOrderId = randomId("mockorder");
    const state: MockOrderState = {
      externalOrderId,
      status: "PENDING",
      trackingNumber: null,
      trackingUrl: null,
      carrier: null,
      createdAt: new Date(),
    };
    mockOrders.set(externalOrderId, state);
    return { externalOrderId, status: state.status, trackingNumber: null, trackingUrl: null, carrier: null };
  }

  async getOrder(externalOrderId: string): Promise<ProviderOrder | null> {
    const state = mockOrders.get(externalOrderId);
    if (!state) return null;
    return { externalOrderId, status: state.status, trackingNumber: state.trackingNumber, trackingUrl: state.trackingUrl, carrier: state.carrier };
  }

  async cancelOrder(externalOrderId: string): Promise<ProviderOrder> {
    const state = mockOrders.get(externalOrderId);
    if (!state) throw new ProductUnavailableError("Mock order not found.");
    state.status = "CANCELLED";
    return { externalOrderId, status: state.status, trackingNumber: state.trackingNumber, trackingUrl: state.trackingUrl, carrier: state.carrier };
  }

  /** Advances a mock order to a new status and returns the equivalent
   * webhook event shape — used directly by the mock webhook simulator
   * (spec item 46), never exposed to donors. */
  transitionMockOrder(externalOrderId: string, next: ProviderOrderStatus): ParsedWebhookEvent {
    let state = mockOrders.get(externalOrderId);
    if (!state) {
      // Allow simulating events for orders not created through this
      // in-memory map's lifetime (e.g. after a server restart in dev) by
      // synthesizing a plausible state rather than hard-failing.
      state = { externalOrderId, status: "PENDING", trackingNumber: null, trackingUrl: null, carrier: null, createdAt: new Date() };
      mockOrders.set(externalOrderId, state);
    }
    state.status = next;
    if (next === "SHIPPED" || next === "DELIVERED") {
      state.trackingNumber = state.trackingNumber || `MOCKTRACK${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      state.trackingUrl = state.trackingUrl || `https://example-carrier.test/track/${state.trackingNumber}`;
      state.carrier = state.carrier || "Mock Carrier";
    }

    const eventTypeMap: Partial<Record<ProviderOrderStatus, ParsedWebhookEvent["eventType"]>> = {
      IN_FULFILLMENT: "FULFILLMENT_STARTED",
      SHIPPED: "SHIPMENT_CREATED",
      DELIVERED: "SHIPMENT_UPDATED",
      CANCELLED: "ORDER_CANCELLED",
      FAILED: "ORDER_FAILED",
      PARTIALLY_FULFILLED: "ORDER_UPDATED",
      FULFILLED: "ORDER_UPDATED",
      PENDING: "ORDER_UPDATED",
    };

    return {
      externalEventId: randomId("mockevent"),
      eventType: eventTypeMap[next] ?? "ORDER_UPDATED",
      externalOrderId,
      status: next,
      trackingNumber: state.trackingNumber,
      trackingUrl: state.trackingUrl,
      carrier: state.carrier,
      raw: { mock: true, externalOrderId, status: next },
    };
  }

  async parseWebhook(payload: unknown): Promise<ParsedWebhookEvent> {
    const p = payload as Record<string, unknown>;
    return {
      externalEventId: String(p.externalEventId ?? randomId("mockevent")),
      eventType: (p.eventType as ParsedWebhookEvent["eventType"]) ?? "UNKNOWN",
      externalOrderId: (p.externalOrderId as string) ?? null,
      status: (p.status as ProviderOrderStatus) ?? null,
      trackingNumber: (p.trackingNumber as string) ?? null,
      trackingUrl: (p.trackingUrl as string) ?? null,
      carrier: (p.carrier as string) ?? null,
      raw: payload,
    };
  }
}
