import { describe, it, expect, vi } from "vitest";
import type { PlanningCenterClient } from "../resourceClient";
import { createPerson, getPerson, listPeoplePage, searchPeople } from "../people";

function fakeClient(over: { get?: (p: string) => unknown; request?: (p: string, o: { method?: string; body?: unknown }) => unknown }) {
  return {
    get: vi.fn(async (p: string) => over.get?.(p)),
    request: vi.fn(async (p: string, o: { method?: string; body?: unknown }) => over.request?.(p, o)),
  } as unknown as PlanningCenterClient & { get: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> };
}

const response = {
  data: [
    {
      id: "10",
      type: "Person",
      attributes: { name: "Pat Smith", first_name: "Pat", last_name: "Smith", status: "active", child: false },
      relationships: { emails: { data: [{ id: "e1", type: "Email" }] }, phone_numbers: { data: [{ id: "p1", type: "PhoneNumber" }] } },
    },
    { id: "11", type: "Person", attributes: { name: "Old Pat", status: "inactive" }, relationships: { emails: { data: [] }, phone_numbers: { data: [] } } },
    { id: "12", type: "Person", attributes: { name: "Kid", child: true } },
  ],
  included: [
    { id: "e1", type: "Email", attributes: { address: "  Pat@Example.COM " } },
    { id: "e9", type: "Email", attributes: { address: "someone-else@example.com" } },
    { id: "p1", type: "PhoneNumber", attributes: { number: "(816) 555-0100" } },
  ],
};

describe("searchPeople", () => {
  it("includes emails and phones, uses the combined search param, and URL-encodes the query", async () => {
    const client = fakeClient({ get: () => response });
    await searchPeople(client, "pat+x@example.com");
    expect(client.get.mock.calls[0][0]).toBe(
      "/people/v2/people?where[search_name_or_email_or_phone_number]=pat%2Bx%40example.com&include=emails,phone_numbers&per_page=25"
    );
  });

  it("normalizes contact details and attaches only each person's OWN emails/phones", async () => {
    const [pat, oldPat, kid] = await searchPeople(fakeClient({ get: () => response }), "pat");
    expect(pat).toMatchObject({ id: "10", name: "Pat Smith", emails: ["pat@example.com"], isInactive: false, isChild: false });
    expect(pat.phones).toHaveLength(1);
    expect(pat.phones[0]).toMatch(/8165550100$/);
    expect(oldPat).toMatchObject({ id: "11", isInactive: true, emails: [] });
    expect(kid).toMatchObject({ id: "12", isChild: true, emails: [], phones: [] });
  });

  it("treats a person with inactivated_at as inactive", async () => {
    const client = fakeClient({ get: () => ({ data: [{ id: "1", attributes: { name: "X", inactivated_at: "2024-01-01T00:00:00Z" } }] }) });
    expect((await searchPeople(client, "x"))[0].isInactive).toBe(true);
  });

  it("returns [] for an empty or missing body", async () => {
    expect(await searchPeople(fakeClient({ get: () => ({}) }), "x")).toEqual([]);
  });
});

describe("getPerson", () => {
  it("returns null on 404 (merged/deleted) but rethrows other errors", async () => {
    const notFound = Object.assign(new Error("nf"), { status: 404 });
    expect(await getPerson(fakeClient({ get: () => { throw notFound; } }), "1")).toBeNull();
    const boom = Object.assign(new Error("boom"), { status: 500 });
    await expect(getPerson(fakeClient({ get: () => { throw boom; } }), "1")).rejects.toBe(boom);
  });

  it("parses a single-resource response", async () => {
    const client = fakeClient({ get: () => ({ data: { id: "5", attributes: { name: "Solo" } } }) });
    expect((await getPerson(client, "5"))!.name).toBe("Solo");
  });
});

describe("listPeoplePage", () => {
  it("pages oldest-first and reports hasMore only for a full page", async () => {
    const full = { data: Array.from({ length: 100 }, (_, i) => ({ id: String(i), attributes: { name: `P${i}` } })) };
    const client = fakeClient({ get: () => full });
    const page = await listPeoplePage(client, 200);
    expect(client.get.mock.calls[0][0]).toContain("order=created_at");
    expect(client.get.mock.calls[0][0]).toContain("offset=200");
    expect(page.hasMore).toBe(true);
    expect((await listPeoplePage(fakeClient({ get: () => ({ data: [{ id: "1" }] }) }), 0)).hasMore).toBe(false);
  });
});

describe("createPerson", () => {
  it("creates the person then their email and phone", async () => {
    const client = fakeClient({ request: (p) => (p === "/people/v2/people" ? { data: { id: "77" } } : {}) });
    const result = await createPerson(client, { firstName: "A", lastName: "B", email: "a@b.com", phone: "+18165550100" });
    expect(result).toEqual({ id: "77", contactDetailsFailed: false });
    expect(client.request.mock.calls.map((c) => c[0])).toEqual(["/people/v2/people", "/people/v2/people/77/emails", "/people/v2/people/77/phone_numbers"]);
    expect(client.request.mock.calls.every((c) => c[1].method === "POST")).toBe(true);
  });

  it("keeps the person if adding contact details fails (never undoes or retries)", async () => {
    const client = fakeClient({ request: (p) => { if (p === "/people/v2/people") return { data: { id: "77" } }; throw new Error("nope"); } });
    await expect(createPerson(client, { firstName: "A", lastName: "B", email: "a@b.com" })).resolves.toEqual({ id: "77", contactDetailsFailed: true });
    expect(client.request).toHaveBeenCalledTimes(2);
  });

  it("fails if no id comes back, and does not add details to a person that doesn't exist", async () => {
    const client = fakeClient({ request: () => ({}) });
    await expect(createPerson(client, { firstName: "A", lastName: "B", email: "a@b.com" })).rejects.toThrow(/did not return/);
    expect(client.request).toHaveBeenCalledTimes(1);
  });
});
