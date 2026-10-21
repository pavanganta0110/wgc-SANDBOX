import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";
import { PlanningCenterClient } from "./resourceClient";

/**
 * Typed wrappers over the Planning Center People API (version pinned in the
 * OAuth app). Reads, plus the one write the optional CREATE_PERSON policy
 * needs. All requests go through PlanningCenterClient, so GET retries and
 * "never retry a POST" apply automatically.
 */

const PAGE_SIZE = 100;

export interface PcoPersonContact {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  /** Inactive people and children are never matched to a donor automatically. */
  isInactive: boolean;
  isChild: boolean;
  /** Normalized (lowercased/trimmed) email addresses. */
  emails: string[];
  /** Normalized phone numbers (E.164 where recognizable). */
  phones: string[];
}

interface JsonApiResource {
  id: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type?: string } | Array<{ id: string; type?: string }> | null }>;
}
interface JsonApiPeopleResponse {
  data?: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function relIds(person: JsonApiResource, rel: string): string[] {
  const data = person.relationships?.[rel]?.data;
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]).map((d) => d.id);
}

function toPerson(raw: JsonApiResource, included: JsonApiResource[]): PcoPersonContact {
  const a = raw.attributes ?? {};
  const emailIds = new Set(relIds(raw, "emails"));
  const phoneIds = new Set(relIds(raw, "phone_numbers"));
  const emails = included
    .filter((r) => r.type === "Email" && emailIds.has(r.id))
    .map((r) => normalizeEmail(str(r.attributes?.address)))
    .filter((e): e is string => Boolean(e));
  const phones = included
    .filter((r) => r.type === "PhoneNumber" && phoneIds.has(r.id))
    .map((r) => normalizePhone(str(r.attributes?.number)))
    .filter((p): p is string => Boolean(p));
  return {
    id: raw.id,
    name: str(a.name) || [str(a.first_name), str(a.last_name)].filter(Boolean).join(" "),
    firstName: str(a.first_name) || null,
    lastName: str(a.last_name) || null,
    isInactive: str(a.status) === "inactive" || (typeof a.inactivated_at === "string" && a.inactivated_at !== ""),
    isChild: a.child === true,
    emails: [...new Set(emails)],
    phones: [...new Set(phones)],
  };
}

function parseList(body: JsonApiPeopleResponse): PcoPersonContact[] {
  const rows = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
  const included = body.included ?? [];
  return rows.map((r) => toPerson(r, included));
}

/** Fuzzy search by name/email/phone. Callers MUST verify the contact detail
 * they care about exactly — Planning Center's search is a "contains" match. */
export async function searchPeople(client: PlanningCenterClient, query: string): Promise<PcoPersonContact[]> {
  const q = encodeURIComponent(query);
  const body = await client.get<JsonApiPeopleResponse>(
    `/people/v2/people?where[search_name_or_email_or_phone_number]=${q}&include=emails,phone_numbers&per_page=25`
  );
  return parseList(body);
}

/** Null when the person no longer exists (404) — e.g. merged or deleted in Planning Center. */
export async function getPerson(client: PlanningCenterClient, personId: string): Promise<PcoPersonContact | null> {
  try {
    const body = await client.get<JsonApiPeopleResponse>(`/people/v2/people/${encodeURIComponent(personId)}?include=emails,phone_numbers`);
    return parseList(body)[0] ?? null;
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** One page of the directory, oldest first so offsets stay stable while we walk it. */
export async function listPeoplePage(client: PlanningCenterClient, offset: number): Promise<{ people: PcoPersonContact[]; hasMore: boolean }> {
  const body = await client.get<JsonApiPeopleResponse>(
    `/people/v2/people?order=created_at&include=emails,phone_numbers&per_page=${PAGE_SIZE}&offset=${offset}`
  );
  const people = parseList(body);
  return { people, hasMore: people.length === PAGE_SIZE };
}

export const PEOPLE_PAGE_SIZE = PAGE_SIZE;

/**
 * Creates a person (and best-effort their email/phone) for the optional
 * CREATE_PERSON policy. The person id is returned as soon as the person
 * exists; a failure adding contact details afterwards does NOT undo that —
 * the caller links the person and the church can complete the record in
 * Planning Center. Never retried (it is a POST).
 */
export async function createPerson(
  client: PlanningCenterClient,
  input: { firstName: string; lastName: string; email?: string | null; phone?: string | null }
): Promise<{ id: string; contactDetailsFailed: boolean }> {
  const created = await client.request<JsonApiPeopleResponse>("/people/v2/people", {
    method: "POST",
    body: { data: { type: "Person", attributes: { first_name: input.firstName, last_name: input.lastName } } },
  });
  const id = Array.isArray(created.data) ? created.data[0]?.id : created.data?.id;
  if (!id) throw new Error("Planning Center did not return the created person.");

  let contactDetailsFailed = false;
  if (input.email) {
    try {
      await client.request(`/people/v2/people/${encodeURIComponent(id)}/emails`, {
        method: "POST",
        body: { data: { type: "Email", attributes: { address: input.email, location: "Home", primary: true } } },
      });
    } catch {
      contactDetailsFailed = true;
    }
  }
  if (input.phone) {
    try {
      await client.request(`/people/v2/people/${encodeURIComponent(id)}/phone_numbers`, {
        method: "POST",
        body: { data: { type: "PhoneNumber", attributes: { number: input.phone, location: "Home", primary: true } } },
      });
    } catch {
      contactDetailsFailed = true;
    }
  }
  return { id, contactDetailsFailed };
}
