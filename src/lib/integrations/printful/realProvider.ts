import type { PrintProvider } from "./provider";
import { getPrintfulApiBaseUrl } from "./config";
import { PrintfulApiError, PrintfulConnectionError } from "./errors";
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
 * Real Printful adapter. Structurally complete and ready per spec item 23 —
 * authentication, product/variant retrieval, shipping estimate, order
 * create/get/cancel, webhook parsing all have their call sites defined —
 * but does not make real API calls yet because:
 *   1. We do not have production Printful credentials.
 *   2. Printful's exact request/response shapes, webhook event names, and
 *      signature-verification scheme are not yet confirmed against a real
 *      account (spec items 71/72).
 * Every method below throws PrintfulConnectionError with a clear "not wired
 * up yet" message rather than silently returning fake data — the mock
 * adapter is what backs mock mode; this class is only ever instantiated
 * when PRINTFUL_MODE=live AND a church has a connectionType other than
 * "mock" (see service.ts getProviderForChurch). Fill in the marked TODOs
 * once credentials + a confirmed API spec are available; no other file in
 * this feature needs to change to support that (see spec item 72).
 */
export class PrintfulProvider implements PrintProvider {
  private accessToken: string;
  private apiBaseUrl: string;

  constructor(params: { accessToken: string; storeId?: string | null }) {
    this.accessToken = params.accessToken;
    this.apiBaseUrl = getPrintfulApiBaseUrl();
  }

  private notWiredYet(action: string): never {
    throw new PrintfulConnectionError(
      `Real Printful ${action} is not connected yet — this environment does not have live Printful credentials configured. Set PRINTFUL_MODE=mock to use the sandbox mock provider, or provide real credentials and complete the TODOs in realProvider.ts.`
    );
  }

  // TODO(real-printful): GET {apiBaseUrl}/store — confirm response shape once credentials are available.
  async getConnectionInfo(): Promise<ProviderConnectionInfo> {
    this.notWiredYet("getConnectionInfo");
  }

  // TODO(real-printful): a lightweight authenticated GET to confirm the token is valid.
  async testConnection(): Promise<ProviderTestResult> {
    this.notWiredYet("testConnection");
  }

  // TODO(real-printful): GET {apiBaseUrl}/store/products (paginated) -> map via mapper.ts, never return raw Printful shapes.
  async getProducts(): Promise<WgcProduct[]> {
    this.notWiredYet("getProducts");
  }

  // TODO(real-printful): GET {apiBaseUrl}/store/products/{id}
  async getProduct(_externalProductId: string): Promise<WgcProduct | null> {
    this.notWiredYet("getProduct");
  }

  // TODO(real-printful): POST {apiBaseUrl}/shipping/rates
  async getShippingRates(_input: ShippingRateRequest): Promise<ShippingRateOption[]> {
    this.notWiredYet("getShippingRates");
  }

  // TODO(real-printful): POST {apiBaseUrl}/orders — use input.externalOrderReference as Printful's external_id for idempotency (spec item 37).
  async createOrder(_input: CreateProviderOrderInput): Promise<ProviderOrder> {
    this.notWiredYet("createOrder");
  }

  // TODO(real-printful): GET {apiBaseUrl}/orders/{id}
  async getOrder(_externalOrderId: string): Promise<ProviderOrder | null> {
    this.notWiredYet("getOrder");
  }

  // TODO(real-printful): DELETE/cancel endpoint — confirm exact semantics against real API before enabling in the UI (spec item 57).
  async cancelOrder(_externalOrderId: string): Promise<ProviderOrder> {
    this.notWiredYet("cancelOrder");
  }

  // TODO(real-printful): verify signature using PRINTFUL_WEBHOOK_SECRET once Printful's actual signing scheme is documented/confirmed, then map their event `type` string into WgcMerchandiseWebhookEventType here (never inline in the webhook route).
  async parseWebhook(_payload: unknown): Promise<ParsedWebhookEvent> {
    this.notWiredYet("parseWebhook");
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
