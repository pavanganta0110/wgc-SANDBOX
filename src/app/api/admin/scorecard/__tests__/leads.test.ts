import { describe, it, expect, vi, beforeEach } from "vitest";

const session = vi.hoisted(() => ({ getAdminSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);
const store = vi.hoisted(() => ({ listContacts: vi.fn() }));
vi.mock("@/lib/scorecard/store", () => store);

import { GET as list } from "../leads/route";
import { GET as exportCsv } from "../leads/export/route";

const contact = (id: string, email: string, over: Record<string, unknown> = {}) => ({ id, email, created_at: Date.parse("2026-11-20T00:00:00Z"), sent: {}, name: id, org: "Org " + id, ...over });
const get = (path: string) => new Request(`https://wgc.test/api/admin/scorecard/leads${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  session.getAdminSession.mockResolvedValue({ email: "admin@wgc.test" });
  store.listContacts.mockResolvedValue([contact("a", "a@x.co"), contact("b", "b@x.co", { purchase: { started_at: 1, transfer_id: "TR1", status: "sent" } })]);
});

describe("the scorecard leads list", () => {
  it("is for signed-in WGC admins only", async () => {
    session.getAdminSession.mockResolvedValue(null);
    expect((await list(get(""))).status).toBe(401);
    expect((await exportCsv(get("/export"))).status).toBe(401);
    expect(store.listContacts).not.toHaveBeenCalled();
  });

  it("lists the leads with the total, and applies the search and status filters", async () => {
    const all = await (await list(get(""))).json();
    expect(all.total).toBe(2);
    expect(all.leads).toHaveLength(2);
    const sent = await (await list(get("?status=SENT"))).json();
    expect(sent.leads.map((l: { id: string }) => l.id)).toEqual(["b"]);
    expect(sent.total).toBe(2);
    const found = await (await list(get("?q=a@x"))).json();
    expect(found.leads.map((l: { id: string }) => l.id)).toEqual(["a"]);
  });

  it("answers 500 without leaking details when the database fails", async () => {
    store.listContacts.mockRejectedValue(new Error("secret db detail"));
    const res = await list(get(""));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret db detail");
  });
});

describe("the scorecard leads CSV", () => {
  it("downloads a CSV with the same filters, and safe against formulas", async () => {
    store.listContacts.mockResolvedValue([contact("a", "a@x.co", { name: "=1+1" })]);
    const res = await exportCsv(get("/export?status=ALL"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv");
    expect(res.headers.get("content-disposition")).toContain("scorecard_leads.csv");
    const text = await res.text();
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("'=1+1");
  });
});
