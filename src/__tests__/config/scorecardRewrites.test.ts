import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

type Rewrite = { source: string; destination: string; has?: Array<{ type: string; value: string }> };

describe("the fundraising scorecard's host rewrites", async () => {
  const rewrites = (await nextConfig.rewrites!()) as { beforeFiles: Rewrite[]; afterFiles: Rewrite[]; fallback: Rewrite[] };

  it("map the scorecard's pages only on the fund hosts, never for the main site", () => {
    expect(rewrites.beforeFiles.length).toBeGreaterThan(0);
    for (const r of rewrites.beforeFiles) {
      expect(r.has?.[0].type).toBe("host");
      expect(r.has?.[0].value).toMatch(/^fund\\\./);
      expect(r.destination).toMatch(/^\/scorecard\//);
    }
    const hosts = new Set(rewrites.beforeFiles.map((r) => r.has![0].value));
    expect(hosts).toEqual(new Set(["fund\\.wgcpayments\\.com", "fund\\.wgcpaymentssandbox\\.com"]));
  });

  it("cover the home page and both result pages for each host", () => {
    const byHost = rewrites.beforeFiles.filter((r) => r.has![0].value === "fund\\.wgcpayments\\.com");
    expect(byHost.map((r) => r.source).sort()).toEqual(["/", "/completescoreboard", "/completescoreboard/", "/tryagain", "/tryagain/"]);
    expect(byHost.find((r) => r.source === "/")!.destination).toBe("/scorecard/index.html");
    expect(byHost.find((r) => r.source === "/completescoreboard")!.destination).toBe("/scorecard/completescoreboard/index.html");
  });

  it("add nothing after or before other rules", () => {
    expect(rewrites.afterFiles).toEqual([]);
    expect(rewrites.fallback).toEqual([]);
  });
});

describe("the fundraising scorecard's microphone", () => {
  type HeaderRule = { source: string; has?: Array<{ type: string; value: string }>; headers: Array<{ key: string; value: string }> };

  it("is allowed on the fund hosts only, so speaking an answer works there and nowhere else", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const mic = rules.filter((r) => r.headers.some((h) => h.key === "Permissions-Policy" && h.value.includes("microphone=(self)")));
    expect(mic.length).toBeGreaterThan(0);
    for (const r of mic) expect(r.has?.[0].value).toMatch(/^fund\\\./);
    // the site-wide rule still blocks the microphone for every other host
    const global = rules.find((r) => r.source === "/(.*)" && !r.has)!;
    expect(global.headers.find((h) => h.key === "Permissions-Policy")!.value).toContain("microphone=()");
    // and a fund-host rule comes after it, so it wins
    expect(rules.indexOf(mic[0])).toBeGreaterThan(rules.indexOf(global));
  });
});
