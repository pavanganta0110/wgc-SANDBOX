import { prisma } from "@/lib/prisma";
import { PlanningCenterApiError, PlanningCenterSetupError } from "./errors";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * The "WGC Giving" section on a person's profile, built with Planning Center's People API only (People is free, and
 * no Giving donation is ever created). Verified against the API reference: a Tab holds FieldDefinitions
 * (POST /people/v2/tabs, POST /people/v2/tabs/{id}/field_definitions) and a person's values are FieldData
 * (POST /people/v2/people/{id}/field_data, PATCH /people/v2/field_data/{id}).
 *
 * Not yet confirmed against a real account: that `number` fields accept two decimals, that `date` fields take
 * YYYY-MM-DD, and which Planning Center permission is needed to add a tab. The shape of every field lives in ONE table
 * below so a correction after the sandbox test is a one-line change.
 */

export const PROFILE_TAB_NAME = "WGC Giving";

export interface ProfileFieldSpec {
  key: string;
  name: string;
  dataType: "number" | "date" | "string";
}

export const PROFILE_FIELDS: ProfileFieldSpec[] = [
  { key: "given_this_year", name: "Given this year (USD)", dataType: "number" },
  { key: "given_last_year", name: "Given last year (USD)", dataType: "number" },
  { key: "lifetime_total", name: "Lifetime giving (USD)", dataType: "number" },
  { key: "gift_count", name: "Number of gifts", dataType: "number" },
  { key: "first_gift", name: "First gift", dataType: "date" },
  { key: "last_gift", name: "Last gift", dataType: "date" },
  { key: "last_gift_amount", name: "Last gift amount (USD)", dataType: "number" },
  { key: "recurring", name: "Recurring gift", dataType: "string" },
  { key: "main_fund", name: "Main fund", dataType: "string" },
  { key: "wgc_link", name: "Giving details in WGC", dataType: "string" },
];

interface JsonApiResource {
  id?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string } | null }>;
}
interface JsonApiList {
  data?: JsonApiResource[];
  links?: { next?: string };
}
interface JsonApiOne {
  data?: JsonApiResource;
}

const PAGE = 100;
const MAX_PAGES = 20;

async function listAll(client: PlanningCenterClient, path: string): Promise<JsonApiResource[]> {
  const rows: JsonApiResource[] = [];
  const joiner = path.includes("?") ? "&" : "?";
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await client.get<JsonApiList>(`${path}${joiner}per_page=${PAGE}&offset=${page * PAGE}`);
    const data = body.data ?? [];
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** Planning Center refusing us is a "reconnect with the right person" problem, not a crash. */
function explainAccess(err: unknown): never {
  if (err instanceof PlanningCenterApiError && (err.status === 401 || err.status === 403)) {
    throw new PlanningCenterSetupError("Planning Center won't let this account add profile fields. Reconnect Planning Center with a People administrator.");
  }
  throw err;
}

export interface ProfileSetup {
  tabId: string;
  /** field key -> Planning Center field definition id */
  fieldIds: Record<string, string>;
}

function parseStored(config: { pcoProfileTabId: string | null; pcoProfileFieldIds: unknown } | null): ProfileSetup | null {
  if (!config?.pcoProfileTabId || !config.pcoProfileFieldIds || typeof config.pcoProfileFieldIds !== "object") return null;
  const ids = config.pcoProfileFieldIds as Record<string, unknown>;
  const fieldIds: Record<string, string> = {};
  for (const f of PROFILE_FIELDS) {
    if (typeof ids[f.key] !== "string") return null;
    fieldIds[f.key] = ids[f.key] as string;
  }
  return { tabId: config.pcoProfileTabId, fieldIds };
}

/**
 * Makes sure the "WGC Giving" tab and its fields exist, creating only what is missing. Safe to run any number of times:
 * it always LOOKS first (by name), so a create whose answer was lost can never produce a second tab or field.
 * Fields a church deleted are re-created; a church's own edits (like reordering) are left alone.
 */
export async function ensureProfileSetup(churchId: string, client: PlanningCenterClient): Promise<ProfileSetup> {
  const config = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
  if (!config) throw new PlanningCenterSetupError("Connect Planning Center first.");
  const stored = parseStored(config);

  try {
    const tabs = await listAll(client, "/people/v2/tabs");
    const wanted = PROFILE_TAB_NAME.toLowerCase();
    const matches = tabs.filter((t) => String(t.attributes?.name ?? "").trim().toLowerCase() === wanted);
    // If the stored tab still exists keep it; otherwise the oldest tab with our name (never create a second one).
    const existingTab = (stored && tabs.find((t) => t.id === stored.tabId)) || matches.sort((a, b) => Number(a.id) - Number(b.id))[0];
    let tabId = existingTab?.id;
    if (!tabId) {
      const created = await client.request<JsonApiOne>("/people/v2/tabs", {
        method: "POST",
        body: { data: { type: "Tab", attributes: { name: PROFILE_TAB_NAME } } },
      });
      tabId = created.data?.id;
      if (!tabId) throw new PlanningCenterSetupError("Planning Center didn't confirm the new profile section. Try again.");
    }

    const defs = await listAll(client, `/people/v2/tabs/${encodeURIComponent(tabId)}/field_definitions`);
    const byName = new Map(defs.map((d) => [String(d.attributes?.name ?? "").trim().toLowerCase(), d.id!]));
    const fieldIds: Record<string, string> = {};
    for (const [index, spec] of PROFILE_FIELDS.entries()) {
      const found = byName.get(spec.name.toLowerCase());
      if (found) {
        fieldIds[spec.key] = found;
        continue;
      }
      const created = await client.request<JsonApiOne>(`/people/v2/tabs/${encodeURIComponent(tabId)}/field_definitions`, {
        method: "POST",
        body: { data: { type: "FieldDefinition", attributes: { name: spec.name, data_type: spec.dataType, sequence: index + 1 } } },
      });
      if (!created.data?.id) throw new PlanningCenterSetupError(`Planning Center didn't confirm the "${spec.name}" field. Try again.`);
      fieldIds[spec.key] = created.data.id;
    }

    const changed = !stored || stored.tabId !== tabId || PROFILE_FIELDS.some((f) => stored.fieldIds[f.key] !== fieldIds[f.key]);
    if (changed) await prisma.planningCenterSyncConfig.update({ where: { churchId }, data: { pcoProfileTabId: tabId, pcoProfileFieldIds: fieldIds } });
    return { tabId, fieldIds };
  } catch (err) {
    return explainAccess(err);
  }
}

/** What's stored from an earlier setup, with no Planning Center call. */
export async function getStoredProfileSetup(churchId: string): Promise<ProfileSetup | null> {
  return parseStored(await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } }));
}

export interface WriteResult {
  written: number;
  unchanged: number;
}

/**
 * Writes the given values onto one person's profile. It READS the person's current values first, then only creates
 * or changes what differs, so repeating it is harmless and an unknown outcome never creates a second value.
 * `null` values are skipped (nothing to show yet).
 */
export async function writeProfileValues(client: PlanningCenterClient, personId: string, setup: ProfileSetup, values: Record<string, string | null>): Promise<WriteResult> {
  const pid = encodeURIComponent(personId);
  const existing = await listAll(client, `/people/v2/people/${pid}/field_data`);
  const byDefinition = new Map<string, { id: string; value: string }>();
  for (const row of existing) {
    const definitionId = row.relationships?.field_definition?.data?.id;
    if (definitionId && row.id && !byDefinition.has(definitionId)) byDefinition.set(definitionId, { id: row.id, value: String(row.attributes?.value ?? "") });
  }

  const result: WriteResult = { written: 0, unchanged: 0 };
  for (const spec of PROFILE_FIELDS) {
    const value = values[spec.key];
    if (value === null || value === undefined) continue;
    const definitionId = setup.fieldIds[spec.key];
    const current = byDefinition.get(definitionId);
    if (current && sameValue(spec.dataType, current.value, value)) {
      result.unchanged++;
      continue;
    }
    try {
      if (current) {
        await client.request(`/people/v2/field_data/${encodeURIComponent(current.id)}`, { method: "PATCH", body: { data: { type: "FieldDatum", id: current.id, attributes: { value } } } });
      } else {
        await client.request(`/people/v2/people/${pid}/field_data`, { method: "POST", body: { data: { type: "FieldDatum", attributes: { field_definition_id: Number(definitionId), value } } } });
      }
    } catch (err) {
      return explainAccess(err);
    }
    result.written++;
  }
  return result;
}

/** Numbers and dates can come back formatted differently from how we wrote them. */
function sameValue(dataType: ProfileFieldSpec["dataType"], current: string, wanted: string): boolean {
  if (current === wanted) return true;
  if (dataType === "number") {
    const a = Number(current);
    const b = Number(wanted);
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }
  if (dataType === "date") return current.slice(0, 10) === wanted;
  return false;
}
