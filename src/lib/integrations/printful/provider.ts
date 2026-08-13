import type {
  CreateProviderOrderInput,
  ParsedWebhookEvent,
  ProviderConnectionInfo,
  ProviderOrder,
  ProviderTestResult,
  ShippingRateOption,
  ShippingRateRequest,
  WgcProduct,
} from "./types";

/**
 * The one interface both MockPrintfulProvider and PrintfulProvider (real)
 * implement. Nothing above this layer (API routes, service.ts) is allowed
 * to know which one it's talking to — see service.ts's getProviderForChurch
 * for the only place that decision is made (based on PrintfulConnection.
 * connectionType / global PRINTFUL_MODE).
 */
export interface PrintProvider {
  getConnectionInfo(): Promise<ProviderConnectionInfo>;
  testConnection(): Promise<ProviderTestResult>;

  getProducts(): Promise<WgcProduct[]>;
  getProduct(externalProductId: string): Promise<WgcProduct | null>;

  getShippingRates(input: ShippingRateRequest): Promise<ShippingRateOption[]>;

  createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder>;
  getOrder(externalOrderId: string): Promise<ProviderOrder | null>;
  cancelOrder(externalOrderId: string): Promise<ProviderOrder>;

  /** Verifies/parses a raw inbound webhook payload into WGC's internal
   * event shape. Signature verification (when Printful's real spec is
   * known) happens here or one layer up in the route — see webhooks.ts. */
  parseWebhook(payload: unknown): Promise<ParsedWebhookEvent>;
}
