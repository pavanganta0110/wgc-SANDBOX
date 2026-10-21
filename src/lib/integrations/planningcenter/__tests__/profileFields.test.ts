/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cfg: { row: Record<string, any> | null } = { row: null };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterSyncConfig: {
      findUnique: async () => cfg.row,
      update: async ({ data }: any) => Object.assign(cfg.row!, data),
    },
  },
}));

import { PlanningCenterApiError, PlanningCenterSetupError } from "../errors";
import { ensureProfileSetup, PROFILE_FIELDS, PROFILE_TAB_NAME, writeProfileValues } from "../profileFields";

/** A tiny in-memory Planning Center People API. */
function fakePco() {
  const state = { tabs: [] as any[], defs: [] as any[], data: [] as any[], next: 100, calls: [] as string[], deny: false };
  const resource = (id: string, attributes: any, relationships?: any) => ({ id, attributes, relationships });
  const client: any = {
    get: async (path: string) => client.request(path, { method: "GET" }),
    request: async (path: string, opts: { method?: string; body?: any } = {}) => {
      const method = opts.method ?? "GET";
      state.calls.push(`${method} ${path.split("?")[0]}`);
      if (state.deny && method !== "GET") throw new PlanningCenterApiError({ category: "ACCESS_DENIED", safeMessage: "no", retryable: false }, 403);
      let m: RegExpMatchArray | null;
      if (path.startsWith("/people/v2/tabs") && !path.includes("field_definitions")) {
        if (method === "POST") {
          const t = resource(String(state.next++), { name: opts.body.data.attributes.name });
          state.tabs.push(t);
          return { data: t };
        }
        return { data: state.tabs };
      }
      if ((m = path.match(/^\/people\/v2\/tabs\/(\d+)\/field_definitions/))) {
        if (method === "POST") {
          const d = resource(String(state.next++), opts.body.data.attributes, { tab: { data: { id: m[1] } } });
          state.defs.push(d);
          return { data: d };
        }
        return { data: state.defs };
      }
      if ((m = path.match(/^\/people\/v2\/people\/([^/]+)\/field_data/))) {
        if (method === "POST") {
          const d = resource(String(state.next++), { value: opts.body.data.attributes.value }, { field_definition: { data: { id: String(opts.body.data.attributes.field_definition_id) } } });
          (d as any).person = m[1];
          state.data.push(d);
          return { data: d };
        }
        return { data: state.data.filter((d) => d.person === m![1]) };
      }
      if ((m = path.match(/^\/people\/v2\/field_data\/(\d+)/)) && method === "PATCH") {
        const d = state.data.find((x) => x.id === m![1])!;
        d.attributes.value = opts.body.data.attributes.value;
        return { data: d };
      }
      throw new Error(`unexpected ${method} ${path}`);
    },
  };
  return { client, state };
}

beforeEach(() => {
  cfg.row = { churchId: "c1", pcoProfileTabId: null, pcoProfileFieldIds: null };
});

describe("ensureProfileSetup", () => {
  it("creates the 'WGC Giving' section and every field once, and remembers them", async () => {
    const { client, state } = fakePco();
    const setup = await ensureProfileSetup("c1", client);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].attributes.name).toBe(PROFILE_TAB_NAME);
    expect(state.defs).toHaveLength(PROFILE_FIELDS.length);
    expect(Object.keys(setup.fieldIds)).toEqual(PROFILE_FIELDS.map((f) => f.key));
    expect(cfg.row!.pcoProfileTabId).toBe(setup.tabId);
  });

  it("running it again creates nothing new", async () => {
    const { client, state } = fakePco();
    await ensureProfileSetup("c1", client);
    const before = state.calls.filter((c) => c.startsWith("POST")).length;
    await ensureProfileSetup("c1", client);
    expect(state.calls.filter((c) => c.startsWith("POST")).length).toBe(before);
  });

  it("finds a section that already exists (even if our record of it was lost) instead of creating a second", async () => {
    const { client, state } = fakePco();
    await ensureProfileSetup("c1", client);
    cfg.row = { churchId: "c1", pcoProfileTabId: null, pcoProfileFieldIds: null }; // we forgot
    await ensureProfileSetup("c1", client);
    expect(state.tabs).toHaveLength(1);
    expect(state.defs).toHaveLength(PROFILE_FIELDS.length);
  });

  it("re-creates only a field the church deleted", async () => {
    const { client, state } = fakePco();
    await ensureProfileSetup("c1", client);
    state.defs.splice(2, 1);
    await ensureProfileSetup("c1", client);
    expect(state.defs).toHaveLength(PROFILE_FIELDS.length);
  });

  it("explains, in plain words, when Planning Center won't let this account add fields", async () => {
    const { client, state } = fakePco();
    state.deny = true;
    await expect(ensureProfileSetup("c1", client)).rejects.toThrow(PlanningCenterSetupError);
    await expect(ensureProfileSetup("c1", client)).rejects.toThrow(/People administrator/);
  });
});

describe("writeProfileValues", () => {
  const values = (over: Record<string, string | null> = {}) => ({ given_this_year: "100.00", given_last_year: "0.00", lifetime_total: "100.00", gift_count: "1", first_gift: "2026-01-01", last_gift: "2026-01-01", last_gift_amount: "100.00", recurring: "No", main_fund: "General", wgc_link: "https://x/d1", ...over });

  it("writes every value to a person who has none", async () => {
    const { client, state } = fakePco();
    const setup = await ensureProfileSetup("c1", client);
    const r = await writeProfileValues(client, "p1", setup, values());
    expect(r.written).toBe(PROFILE_FIELDS.length);
    expect(state.data).toHaveLength(PROFILE_FIELDS.length);
  });

  it("writing the same values again changes nothing (an unknown outcome can never double a value)", async () => {
    const { client, state } = fakePco();
    const setup = await ensureProfileSetup("c1", client);
    await writeProfileValues(client, "p1", setup, values());
    const r = await writeProfileValues(client, "p1", setup, values());
    expect(r).toEqual({ written: 0, unchanged: PROFILE_FIELDS.length });
    expect(state.data).toHaveLength(PROFILE_FIELDS.length);
  });

  it("updates only what changed, in place", async () => {
    const { client, state } = fakePco();
    const setup = await ensureProfileSetup("c1", client);
    await writeProfileValues(client, "p1", setup, values());
    const r = await writeProfileValues(client, "p1", setup, values({ given_this_year: "250.00", lifetime_total: "250.00" }));
    expect(r.written).toBe(2);
    expect(state.data).toHaveLength(PROFILE_FIELDS.length);
    expect(state.data.find((d) => d.relationships.field_definition.data.id === setup.fieldIds.given_this_year).attributes.value).toBe("250.00");
  });

  it("treats 100 and 100.00 (and a date with a time) as the same value", async () => {
    const { client } = fakePco();
    const setup = await ensureProfileSetup("c1", client);
    await writeProfileValues(client, "p1", setup, values());
    // Planning Center may hand numbers and dates back formatted differently.
    const r = await writeProfileValues(client, "p1", setup, values({ given_this_year: "100", last_gift: "2026-01-01" }));
    expect(r.written).toBe(0);
  });

  it("skips values that are null (nothing to show yet) and never blanks an existing value", async () => {
    const { client, state } = fakePco();
    const setup = await ensureProfileSetup("c1", client);
    await writeProfileValues(client, "p1", setup, values());
    const r = await writeProfileValues(client, "p1", setup, values({ last_gift_amount: null, main_fund: null }));
    expect(r.written).toBe(0);
    expect(state.data).toHaveLength(PROFILE_FIELDS.length);
  });

  it("keeps one person's values apart from another's", async () => {
    const { client, state } = fakePco();
    const setup = await ensureProfileSetup("c1", client);
    await writeProfileValues(client, "p1", setup, values());
    await writeProfileValues(client, "p2", setup, values({ given_this_year: "5.00" }));
    expect(state.data).toHaveLength(PROFILE_FIELDS.length * 2);
  });
});
