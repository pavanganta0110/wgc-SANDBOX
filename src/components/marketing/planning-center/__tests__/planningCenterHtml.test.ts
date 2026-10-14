import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PLANNING_CENTER_HTML } from "../planningCenterHtml";

const publicFile = (p: string) => path.join(process.cwd(), "public", p.replace(/^\//, ""));

describe("/planning-center landing page markup", () => {
  it("has no design-tool leftovers or placeholder text that must never ship", () => {
    for (const bad of ["sc-raw", "sc-camel", "x-dc", "helmet", "[Founder video", "[Calendly embed", "Lorem", "TODO"]) {
      expect(PLANNING_CENTER_HTML, bad).not.toContain(bad);
    }
  });

  it("leaves the header and footer to the site (they wrap this markup)", () => {
    expect(PLANNING_CENTER_HTML).not.toMatch(/<header\b/);
    expect(PLANNING_CENTER_HTML).not.toMatch(/<footer\b/);
  });

  it("keeps the independent-integration disclaimer", () => {
    expect(PLANNING_CENTER_HTML).toContain("not affiliated with or endorsed by Planning Center");
  });

  it("has the booking iframe slot and the real founder video, and no stray scripts", () => {
    expect(PLANNING_CENTER_HTML).toContain('src="__CALENDLY__"');
    expect(PLANNING_CENTER_HTML).toContain('src="/videos/wgc-founder.mp4"');
    expect(PLANNING_CENTER_HTML).not.toMatch(/<script\b/i);
    expect(PLANNING_CENTER_HTML).not.toMatch(/\son[a-z]+=/i); // no inline event handlers
  });

  it("every asset it points at exists in /public", () => {
    const assets = [...PLANNING_CENTER_HTML.matchAll(/(?:src|poster)="(\/[^"]+)"/g)].map((m) => m[1]);
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) expect(fs.existsSync(publicFile(a)), a).toBe(true);
  });

  it("internal links point at real site routes, and in-page anchors point at real ids", () => {
    const hrefs = [...PLANNING_CENTER_HTML.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const ids = new Set([...PLANNING_CENTER_HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const href of hrefs) {
      if (href.startsWith("#")) expect(ids.has(href.slice(1)), href).toBe(true);
      else if (href.startsWith("/")) {
        const route = href.split("#")[0].split("?")[0].replace(/^\//, "").split("/")[0];
        expect(route === "" || fs.existsSync(path.join(process.cwd(), "src", "app", route)), href).toBe(true);
      } else expect(href).toMatch(/^https:\/\/www\.planningcenter\.com\//);
    }
  });

  it("scopes every class it uses to this page", () => {
    const classes = [...PLANNING_CENTER_HTML.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
    for (const c of classes) expect(c.startsWith("pco-"), c).toBe(true);
  });

  it("the fee figures match the site's pricing page", () => {
    const pricing = fs.readFileSync(path.join(process.cwd(), "src/app/pricing/page.tsx"), "utf8");
    expect(pricing).toContain("2.3%");
    expect(pricing).toContain("25¢");
    expect(pricing).toContain("$10/month");
    expect(PLANNING_CENTER_HTML).toContain("2.3% + 25¢");
    expect(PLANNING_CENTER_HTML).toContain("$10/month");
  });
});
