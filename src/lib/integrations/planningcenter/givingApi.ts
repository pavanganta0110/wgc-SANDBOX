import { PlanningCenterClient } from "./resourceClient";

/**
 * Typed wrappers over the Planning Center Giving API (version 2019-10-18) for
 * the resources phase 3 needs: Funds and PaymentSources. Everything goes
 * through PlanningCenterClient, so the User-Agent, rate-limit pacing and the
 * "GET retries, POST/PATCH never do" rule apply automatically.
 */

export const PAYMENT_SOURCE_NAME = "WGC Payments";

const PAGE_SIZE = 100; // Planning Center's maximum per_page
const MAX_PAGES = 50; // hard stop: 5,000 records is far beyond any real org

export type PcoFundVisibility = "everywhere" | "admin_only" | "nowhere" | "hidden";

export interface PcoFund {
  id: string;
  name: string;
  isDefault: boolean;
  visibility: PcoFundVisibility | string;
  ledgerCode: string | null;
}

export interface PcoPaymentSource {
  id: string;
  name: string;
  status: "active" | "archived" | string;
}

interface JsonApiResource {
  id: string;
  attributes?: Record<string, unknown>;
}
interface JsonApiList {
  data?: JsonApiResource[];
}
interface JsonApiOne {
  data?: JsonApiResource;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Walks every page of a Giving collection. Offset paging is fine at these
 * sizes; the 30,000-offset rate-limit cliff is nowhere near reachable. */
async function listAll(client: PlanningCenterClient, path: string): Promise<JsonApiResource[]> {
  const out: JsonApiResource[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await client.get<JsonApiList>(`${path}${sep}per_page=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
    const rows = body.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

function toFund(r: JsonApiResource): PcoFund {
  const a = r.attributes ?? {};
  return {
    id: r.id,
    name: str(a.name),
    isDefault: a.default === true,
    visibility: str(a.visibility),
    ledgerCode: typeof a.ledger_code === "string" && a.ledger_code !== "" ? a.ledger_code : null,
  };
}

function toSource(r: JsonApiResource): PcoPaymentSource {
  const a = r.attributes ?? {};
  return { id: r.id, name: str(a.name), status: str(a.status) || "active" };
}

export async function listFunds(client: PlanningCenterClient): Promise<PcoFund[]> {
  return (await listAll(client, "/giving/v2/funds")).map(toFund);
}

/** `visibility: nowhere` blocks designating a donation to the fund at all. */
export function isFundUsable(fund: PcoFund): boolean {
  return fund.visibility !== "nowhere";
}

export async function createFund(
  client: PlanningCenterClient,
  input: { name: string; description?: string | null; visibility?: PcoFundVisibility }
): Promise<PcoFund> {
  const attributes: Record<string, unknown> = {
    name: input.name,
    // admin_only keeps a WGC-created fund off the church's own Church Center
    // donation form, so it never appears to donors there by surprise.
    visibility: input.visibility ?? "admin_only",
  };
  if (input.description) attributes.description = input.description.slice(0, 255);
  const body = await client.request<JsonApiOne>("/giving/v2/funds", {
    method: "POST",
    body: { data: { type: "Fund", attributes } },
  });
  if (!body.data?.id) throw new Error("Planning Center did not return the created fund.");
  return toFund(body.data);
}

export async function listPaymentSources(client: PlanningCenterClient): Promise<PcoPaymentSource[]> {
  return (await listAll(client, "/giving/v2/payment_sources")).map(toSource);
}

export async function createPaymentSource(client: PlanningCenterClient, name: string): Promise<PcoPaymentSource> {
  const body = await client.request<JsonApiOne>("/giving/v2/payment_sources", {
    method: "POST",
    body: { data: { type: "PaymentSource", attributes: { name } } },
  });
  if (!body.data?.id) throw new Error("Planning Center did not return the created payment source.");
  return toSource(body.data);
}

/** PATCH with the values the source already has. A no-op for the data, but it
 * proves the connected user can write to Giving without creating anything. */
export async function touchPaymentSource(
  client: PlanningCenterClient,
  source: PcoPaymentSource,
  options: { reactivate?: boolean } = {}
): Promise<PcoPaymentSource> {
  const attributes: Record<string, unknown> = { name: source.name };
  if (options.reactivate) attributes.status = "active";
  const body = await client.request<JsonApiOne>(`/giving/v2/payment_sources/${encodeURIComponent(source.id)}`, {
    method: "PATCH",
    body: { data: { type: "PaymentSource", id: source.id, attributes } },
  });
  return body.data ? toSource(body.data) : { ...source, status: options.reactivate ? "active" : source.status };
}

/** Case/space-insensitive key for suggesting a WGC fund ↔ Planning Center fund match. */
export function normalizeFundName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
