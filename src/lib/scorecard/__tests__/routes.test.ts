import { describe, it, expect, vi, beforeEach } from "vitest";

const limit = vi.hoisted(() => ({ allowed: true, calls: [] as Array<[string, number]> }));
vi.mock("../rateLimit", () => ({
  clientIp: () => "1.2.3.4",
  allow: async (_ip: string, bucket: string, n: number) => {
    limit.calls.push([bucket, n]);
    return limit.allowed;
  },
}));
const svc = vi.hoisted(() => ({ handleScore: vi.fn(), handleSubmit: vi.fn(), handlePurchase: vi.fn(), handleAdminSend: vi.fn(), handleUnsubscribe: vi.fn(), runFollowups: vi.fn() }));
vi.mock("../service", () => svc);
vi.mock("@/lib/cron/alertCronMisconfiguration", () => ({ alertCronMisconfiguration: vi.fn() }));

import { POST as score } from "@/app/api/scorecard/score/route";
import { POST as submit } from "@/app/api/scorecard/submit/route";
import { POST as purchase } from "@/app/api/scorecard/purchase/route";
import { GET as cron } from "@/app/api/scorecard/cron/route";
import { GET as unsub } from "@/app/api/scorecard/unsubscribe/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/scorecard/admin/send-report/route";

const post = (body: unknown) => new Request("https://fund.test/api/scorecard/x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  limit.allowed = true;
  limit.calls = [];
  svc.handleScore.mockResolvedValue({ status: 200, json: { ok: 1 } });
  svc.handleSubmit.mockResolvedValue({ status: 200, json: { ok: 1 } });
  svc.handlePurchase.mockResolvedValue({ status: 200, json: { ok: 1 } });
  svc.handleAdminSend.mockResolvedValue({ status: 200, html: "<p>x</p>" });
  svc.handleUnsubscribe.mockResolvedValue({ status: 200, html: "<p>bye</p>" });
  svc.runFollowups.mockResolvedValue(["L1 -> a@b.co"]);
});

describe("the public scorecard routes", () => {
  it("limit each visitor per minute: scoring 6, submit 20, purchase 10", async () => {
    await score(post({}));
    await submit(post({}));
    await purchase(post({}));
    expect(limit.calls).toEqual([["score", 6], ["submit", 20], ["results-email", 3], ["purchase", 10]]);
  });

  it("pass the results-email limit on to the submit handler, so the page can't be used to email one address over and over", async () => {
    await submit(post({ form: "scorecard-lead" }));
    expect(svc.handleSubmit).toHaveBeenLastCalledWith({ form: "scorecard-lead" }, { allowResultsEmail: true });
    limit.allowed = false;
    // over the page limit: refused before anything runs
    expect((await submit(post({}))).status).toBe(429);
  });

  it("answer 429 and do no work when over the limit (AI scoring costs money)", async () => {
    limit.allowed = false;
    expect((await score(post({}))).status).toBe(429);
    expect((await submit(post({}))).status).toBe(429);
    expect((await purchase(post({}))).status).toBe(429);
    expect(svc.handleScore).not.toHaveBeenCalled();
    expect(svc.handlePurchase).not.toHaveBeenCalled();
  });

  it("refuse a body that is not JSON or is far too big", async () => {
    expect((await score(post("not json"))).status).toBe(400);
    expect((await submit(post("x".repeat(250_000)))).status).toBe(400);
    expect(svc.handleScore).not.toHaveBeenCalled();
  });

  it("pass only the purchase fields on, and mark the unsubscribe and admin pages as no-index and uncached", async () => {
    await purchase(post({ lead_id: "l", transfer_id: "TR1", fields: { a: 1 }, extra: "ignored" }));
    expect(svc.handlePurchase).toHaveBeenCalledWith({ lead_id: "l", transfer_id: "TR1", fields: { a: 1 } });
    const res = await unsub(new Request("https://fund.test/api/scorecard/unsubscribe?id=a&t=b"));
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(svc.handleUnsubscribe).toHaveBeenCalledWith({ id: "a", t: "b" });
  });

  it("send the admin link's method through, so GET only shows a button", async () => {
    await adminGet(new Request("https://fund.test/api/scorecard/admin/send-report?id=a&t=b"));
    await adminPost(new Request("https://fund.test/api/scorecard/admin/send-report?id=a&t=b", { method: "POST" }));
    expect(svc.handleAdminSend.mock.calls.map((c) => c[0].method)).toEqual(["GET", "POST"]);
  });
});

describe("the follow-up cron", () => {
  const get = (auth?: string) => cron(new Request("https://fund.test/api/scorecard/cron", { headers: auth ? { authorization: auth } : {} }));

  it("needs the cron secret in production, and does nothing without it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "topsecret");
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    expect(svc.runFollowups).not.toHaveBeenCalled();
    const ok = await get("Bearer topsecret");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, sent: ["L1 -> a@b.co"] });
    vi.unstubAllEnvs();
  });

  it("refuses to run in production with no CRON_SECRET configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
    expect((await get()).status).toBe(500);
    vi.unstubAllEnvs();
  });
});
