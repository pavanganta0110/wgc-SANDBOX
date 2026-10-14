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

// ───────────────────────── batches and donations (phase 4) ─────────────────────────

export type PcoBatchStatus = "in_progress" | "updating" | "committed" | string;

export interface PcoBatch {
  id: string;
  description: string;
  status: PcoBatchStatus;
}

export interface PcoDonation {
  id: string;
  amountCents: number;
  /** The calendar date part of received_at. Planning Center may shift a date-only value by the organization's timezone, so compare with a one-day tolerance. */
  receivedOn: string;
  personId: string | null;
  paymentSourceId: string | null;
  feeCents: number;
}

function toBatch(r: JsonApiResource): PcoBatch {
  const a = r.attributes ?? {};
  return { id: r.id, description: str(a.description), status: str(a.status) };
}

function toDonation(r: JsonApiResource & { relationships?: Record<string, { data?: { id: string } | null }> }): PcoDonation {
  const a = r.attributes ?? {};
  const rel = r.relationships ?? {};
  return {
    id: r.id,
    amountCents: typeof a.amount_cents === "number" ? a.amount_cents : 0,
    receivedOn: str(a.received_at).slice(0, 10),
    personId: rel.person?.data?.id ?? null,
    paymentSourceId: rel.payment_source?.data?.id ?? null,
    feeCents: typeof a.fee_cents === "number" ? a.fee_cents : 0,
  };
}

export async function createBatch(client: PlanningCenterClient, description: string): Promise<PcoBatch> {
  const body = await client.request<JsonApiOne>("/giving/v2/batches", {
    method: "POST",
    body: { data: { type: "Batch", attributes: { description } } },
  });
  if (!body.data?.id) throw new Error("Planning Center did not return the created batch.");
  return toBatch(body.data);
}

export async function getBatch(client: PlanningCenterClient, batchId: string): Promise<PcoBatch | null> {
  try {
    const body = await client.get<JsonApiOne>(`/giving/v2/batches/${encodeURIComponent(batchId)}`);
    return body.data ? toBatch(body.data) : null;
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/**
 * Finds a batch by its exact description among the most recently updated
 * ones. This is how an ambiguous batch create is resolved: by READING, never
 * by creating again.
 */
export async function findBatchByDescription(client: PlanningCenterClient, description: string): Promise<PcoBatch | null> {
  for (let page = 0; page < 2; page++) {
    const body = await client.get<JsonApiList>(`/giving/v2/batches?order=-updated_at&per_page=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
    const rows = body.data ?? [];
    const hit = rows.map(toBatch).find((b) => b.description === description);
    if (hit) return hit;
    if (rows.length < PAGE_SIZE) break;
  }
  return null;
}

export async function listBatchDonations(client: PlanningCenterClient, batchId: string): Promise<PcoDonation[]> {
  return (await listAll(client, `/giving/v2/batches/${encodeURIComponent(batchId)}/donations`)).map(toDonation);
}

/** A POST: never retried by the client. Resolve an ambiguous outcome with listBatchDonations. */
export async function createDonation(client: PlanningCenterClient, batchId: string, body: unknown): Promise<{ id: string }> {
  const res = await client.request<JsonApiOne>(`/giving/v2/batches/${encodeURIComponent(batchId)}/donations`, { method: "POST", body });
  if (!res.data?.id) throw new Error("Planning Center did not return the created donation.");
  return { id: res.data.id };
}

/** Asynchronous on Planning Center's side: the batch goes `updating`, then `committed`. */
export async function commitBatch(client: PlanningCenterClient, batchId: string): Promise<void> {
  await client.request(`/giving/v2/batches/${encodeURIComponent(batchId)}/commit`, { method: "POST" });
}
