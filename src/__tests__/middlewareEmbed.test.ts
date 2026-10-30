import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`https://www.wgcpayments.com${path}`, { method: init.method ?? "GET", headers: init.headers });
}

describe("middleware — embedded session support", () => {
  it("lets the embedded-login entry route through without a session, since it creates the session", async () => {
    const res = await middleware(request("/merchant/embed/enter?token=abc"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("still sends other merchant pages without a session to the login page", async () => {
    const res = await middleware(request("/merchant/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/merchant/login");
  });

  it("blocks a merchant API write the browser says came from another site, even with a session cookie", async () => {
    const res = await middleware(
      request("/api/merchant/settings/team", { method: "POST", headers: { "sec-fetch-site": "cross-site", cookie: "wgc_session=anything" } })
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Cross-site requests are not allowed." });
  });

  it("allows the same write from WGC's own page, and cross-site reads", async () => {
    const sameOrigin = await middleware(
      request("/api/merchant/settings/team", { method: "POST", headers: { "sec-fetch-site": "same-origin", cookie: "wgc_session=anything" } })
    );
    expect(sameOrigin.status).toBe(200);

    const crossSiteRead = await middleware(request("/api/merchant/settings/team", { headers: { "sec-fetch-site": "cross-site", cookie: "wgc_session=anything" } }));
    expect(crossSiteRead.status).toBe(200);
  });

  it("sends a signed-out person inside another site's frame to the session-ended screen, not the login page", async () => {
    const res = await middleware(request("/merchant/dashboard", { headers: { "sec-fetch-dest": "iframe", "sec-fetch-site": "cross-site" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/partner-embed/ended");
  });

  it("does not change a normal visit: a signed-out person on WGC's own page, or in WGC's own frame, still goes to login", async () => {
    const normal = await middleware(request("/merchant/dashboard", { headers: { "sec-fetch-dest": "document", "sec-fetch-site": "none" } }));
    expect(normal.headers.get("location")).toContain("/merchant/login");
    const ownFrame = await middleware(request("/merchant/dashboard", { headers: { "sec-fetch-dest": "iframe", "sec-fetch-site": "same-origin" } }));
    expect(ownFrame.headers.get("location")).toContain("/merchant/login");
  });
});
