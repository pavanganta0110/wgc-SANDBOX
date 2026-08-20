import { getQuickBooksApiBaseUrl } from "./config";
import { classifyHttpStatus, classifyNetworkOrTimeoutError, classifyIntuitFaultCode, QuickBooksApiError, type NormalizedQuickBooksError } from "./errors";

/**
 * Thin wrapper over the QuickBooks Online Accounting API (REST + JSON),
 * following the same request<T>() pattern as
 * src/lib/integrations/printful/realProvider.ts: hard timeout via
 * AbortController, Bearer auth header, defensive JSON parsing, typed error
 * on any non-2xx response. No retry/backoff library — retry classification
 * lives in errors.ts, actual scheduling (if ever added) belongs one layer
 * up in the connection/sync service, same division as Aplos.
 *
 * REQUIRES-LIVE-VERIFICATION: field/endpoint shapes below are built
 * directly from Intuit's published Accounting API reference
 * (developer.intuit.com/app/developer/qbo/docs/api/accounting) but have
 * not been exercised against a real sandbox company yet (no Intuit
 * Developer credentials existed at the time this was written) — verify
 * against a real QuickBooks Sandbox company before treating any of this as
 * production-ready.
 */

const REQUEST_TIMEOUT_MS = 20_000;
const API_MINOR_VERSION = "75"; // Intuit's current documented minorversion at time of writing

export interface QuickBooksClientOptions {
  accessToken: string;
  realmId: string;
}

export interface QuickBooksCustomer {
  Id?: string;
  SyncToken?: string;
  DisplayName: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: { Line1?: string; City?: string; CountrySubDivisionCode?: string; PostalCode?: string };
}

export interface QuickBooksInvoiceLine {
  Amount: number;
  DetailType: "SalesItemLineDetail";
  SalesItemLineDetail: { ItemRef: { value: string; name?: string } };
  Description?: string;
}

export interface QuickBooksInvoice {
  Id?: string;
  SyncToken?: string;
  CustomerRef: { value: string };
  Line: QuickBooksInvoiceLine[];
  DueDate?: string;
  DocNumber?: string;
}

export interface QuickBooksPayment {
  Id?: string;
  SyncToken?: string;
  CustomerRef: { value: string };
  TotalAmt: number;
  TxnDate?: string;
  Line?: Array<{ Amount: number; LinkedTxn: Array<{ TxnId: string; TxnType: "Invoice" }> }>;
}

interface IntuitQueryResponse<T> {
  QueryResponse?: Record<string, T[] | number | undefined>;
}

interface IntuitFaultError {
  Message: string;
  code: string;
  Detail?: string;
}

interface IntuitFaultResponse {
  Fault?: { Error: IntuitFaultError[]; type: string };
}

export class QuickBooksNormalizedApiError extends Error {
  readonly normalized: NormalizedQuickBooksError;
  constructor(normalized: NormalizedQuickBooksError) {
    super(normalized.safeMessage);
    this.name = "QuickBooksNormalizedApiError";
    this.normalized = normalized;
  }
}

export class QuickBooksResourceClient {
  private readonly accessToken: string;
  private readonly realmId: string;
  private readonly baseUrl: string;

  constructor(opts: QuickBooksClientOptions) {
    this.accessToken = opts.accessToken;
    this.realmId = opts.realmId;
    this.baseUrl = getQuickBooksApiBaseUrl();
  }

  private async request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const url = `${this.baseUrl}/v3/company/${encodeURIComponent(this.realmId)}${path}${path.includes("?") ? "&" : "?"}minorversion=${API_MINOR_VERSION}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new QuickBooksNormalizedApiError(classifyNetworkOrTimeoutError());
    } finally {
      clearTimeout(timeout);
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      text = "";
    }

    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // non-JSON body — fall through, handled by the !response.ok branch below
      }
    }

    if (!response.ok) {
      const fault = parsed as IntuitFaultResponse | null;
      const firstError = fault?.Fault?.Error?.[0];
      if (firstError?.code) {
        throw new QuickBooksNormalizedApiError(classifyIntuitFaultCode(firstError.code));
      }
      throw new QuickBooksNormalizedApiError(classifyHttpStatus(response.status));
    }

    return (parsed ?? {}) as T;
  }

  /** GET /v3/company/{realmId}/companyinfo/{realmId} — used by
   * testConnection() to prove the token actually works and to surface the
   * company's display name for the UI, without side effects. */
  async getCompanyInfo(): Promise<{ CompanyName?: string; LegalName?: string }> {
    const data = await this.request<{ CompanyInfo?: { CompanyName?: string; LegalName?: string } }>(`/companyinfo/${encodeURIComponent(this.realmId)}`);
    return data.CompanyInfo ?? {};
  }

  async findCustomerByDisplayName(displayName: string): Promise<QuickBooksCustomer | null> {
    const escaped = displayName.replace(/'/g, "\\'");
    const query = `select * from Customer where DisplayName = '${escaped}'`;
    const data = await this.request<IntuitQueryResponse<QuickBooksCustomer>>(`/query?query=${encodeURIComponent(query)}`);
    const rows = (data.QueryResponse?.Customer as QuickBooksCustomer[] | undefined) ?? [];
    return rows[0] ?? null;
  }

  async createCustomer(customer: QuickBooksCustomer): Promise<QuickBooksCustomer> {
    const data = await this.request<{ Customer: QuickBooksCustomer }>("/customer", { method: "POST", body: customer });
    return data.Customer;
  }

  async createInvoice(invoice: QuickBooksInvoice): Promise<QuickBooksInvoice> {
    const data = await this.request<{ Invoice: QuickBooksInvoice }>("/invoice", { method: "POST", body: invoice });
    return data.Invoice;
  }

  async createPayment(payment: QuickBooksPayment): Promise<QuickBooksPayment> {
    const data = await this.request<{ Payment: QuickBooksPayment }>("/payment", { method: "POST", body: payment });
    return data.Payment;
  }
}

/** Real-API connection test — a lightweight authenticated GET with no side
 * effects, matching how PrintfulProvider.testConnection() works. Never
 * assumes success just because decrypt/refresh didn't throw. */
export async function testQuickBooksConnection(opts: QuickBooksClientOptions): Promise<{ ok: boolean; message: string; companyName?: string }> {
  try {
    const client = new QuickBooksResourceClient(opts);
    const info = await client.getCompanyInfo();
    return { ok: true, message: "Connected to QuickBooks.", companyName: info.CompanyName };
  } catch (err) {
    if (err instanceof QuickBooksNormalizedApiError) {
      return { ok: false, message: err.normalized.safeMessage };
    }
    return { ok: false, message: "Could not verify the QuickBooks connection." };
  }
}
