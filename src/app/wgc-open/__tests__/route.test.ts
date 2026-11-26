import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../route";

const KEY = "k".repeat(24);
const open = (q: Record<string, string> = {}) =>
  GET(new Request(`https://wgc.test/wgc-open?${new URLSearchParams({ location: "L1", email: "Boss@x.co", key: KEY, ...q })}`));

let ghlUsers: unknown[];
let ghlStatus: number;
let searchMessage: string | undefined;
let legacyOk = true;
let wgcCalls: Array<{ body: Record<string, unknown>; auth: string | null }>;
let wgcResponse: { status: number; json: unknown };

beforeEach(() => {
  Object.assign(process.env, { WGC_BASE_URL: "https://wgc.test", WGC_API_KEY: "wgc_ptr_x", OPEN_KEY: KEY, GHL_TOKEN: "t", GHL_COMPANY_ID: "co1" });
  ghlStatus = 200;
  searchMessage = undefined;
  legacyOk = true;
  ghlUsers = [{ email: "boss@x.co", roles: { type: "account", role: "admin", locationIds: ["L1"] } }];
  wgcCalls = [];
  wgcResponse = { status: 200, json: { data: { url: "https://wgc.test/partner-embed?link=abc" } } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("leadconnectorhq.com/users/search")) {
        return new Response(JSON.stringify(searchMessage ? { message: searchMessage } : { users: ghlUsers }), { status: searchMessage ? 401 : ghlStatus });
      }
      if (u.includes("leadconnectorhq.com/users/")) return new Response(JSON.stringify(legacyOk ? { users: ghlUsers } : { message: "nope" }), { status: legacyOk ? 200 : 403 });
      wgcCalls.push({ body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify(wgcResponse.json), { status: wgcResponse.status });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /wgc-open", () => {
  it("is not configured without its settings", async () => {
    delete process.env.GHL_TOKEN;
    expect((await open()).status).toBe(500);
  });

  it("refuses a wrong or missing key, and never calls GHL or WGC", async () => {
    expect((await open({ key: "wrong" })).status).toBe(403);
    expect(wgcCalls).toHaveLength(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("asks GHL about this location and person, then sends an admin to a fresh WGC link", async () => {
    const res = await open();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://wgc.test/partner-embed?link=abc");
    const ghlUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(ghlUrl.searchParams.get("locationId")).toBe("L1");
    expect(ghlUrl.searchParams.get("companyId")).toBe("co1");
    expect(wgcCalls[0].auth).toBe("Bearer wgc_ptr_x");
    expect(wgcCalls[0].body).toMatchObject({ reference: "L1", email: "boss@x.co", role: "admin" });
  });

  it("sends an ordinary GHL user as a member", async () => {
    ghlUsers = [{ email: "u@x.co", roles: { type: "account", role: "user", locationIds: ["L1"] } }];
    await open({ email: "u@x.co" });
    expect(wgcCalls[0].body.role).toBe("member");
  });

  it("ignores any role in the link", async () => {
    ghlUsers = [{ email: "u@x.co", roles: { type: "account", role: "user", locationIds: ["L1"] } }];
    await open({ email: "u@x.co", role: "admin" });
    expect(wgcCalls[0].body.role).toBe("member");
  });

  it("refuses someone GHL does not list for this location, or who has another location's access", async () => {
    ghlUsers = [];
    expect((await open()).status).toBe(403);
    ghlUsers = [{ email: "boss@x.co", roles: { type: "account", role: "admin", locationIds: ["OTHER"] } }];
    expect((await open()).status).toBe(403);
    expect(wgcCalls).toHaveLength(0);
  });

  it("lets an agency admin in", async () => {
    ghlUsers = [{ email: "boss@x.co", roles: { type: "agency", role: "admin" } }];
    await open();
    expect(wgcCalls[0].body.role).toBe("admin");
  });

  it("lets nobody in when GHL cannot confirm the person, and says what GHL answered (never the token)", async () => {
    ghlStatus = 401;
    const res = await open();
    expect(res.status).toBe(502);
    const html = await res.text();
    expect(html).toContain("GHL answered 401");
    expect(html).not.toContain(KEY);
    expect(html).not.toContain("wgc_ptr_x");
    expect(wgcCalls).toHaveLength(0);
  });

  it("falls back to the location's own user list when the token has no access to the company", async () => {
    searchMessage = "This token does not have access to the requested company.";
    const res = await open();
    expect(res.status).toBe(303);
    expect(wgcCalls[0].body.role).toBe("admin");
    const calls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("/users/search"))).toBe(true);
    expect(calls.some((c) => /users\/\?locationId=L1/.test(c))).toBe(true);
  });

  it("shows both answers and lets nobody in when the fallback fails too", async () => {
    searchMessage = "This token does not have access to the requested company.";
    legacyOk = false;
    const res = await open();
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("403");
    expect(wgcCalls).toHaveLength(0);
  });

  it("tells the person when WGC says the organization is registered under another reference", async () => {
    wgcResponse = { status: 409, json: { error: { type: "conflict_error", code: "reference_mismatch" } } };
    const res = await open();
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("already set up");
  });

  it("rejects a link without a location or a valid email", async () => {
    expect((await open({ location: "" })).status).toBe(400);
    expect((await open({ email: "nope" })).status).toBe(400);
  });

  it("shows what arrived, but never the key, when details are missing", async () => {
    const res = await open({ email: "{{user.email}}" });
    const html = await res.text();
    expect(res.status).toBe(400);
    expect(html).toContain("{{user.email}}");
    expect(html).toContain("location: L1");
    expect(html).not.toContain(KEY);
    const empty = await (await open({ location: "" })).text();
    expect(empty).toContain("location: (empty)");
  });
});
