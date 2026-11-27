import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GET } from "@/app/api/scorecard/config/route";

const read = (p: string) => readFileSync(path.join(process.cwd(), "public/scorecard", p), "utf8");

beforeEach(() => {
  delete process.env.SCORECARD_GIVING_LINK_SLUG;
});

describe("GET /api/scorecard/config", () => {
  it("gives the live giving link by default, and the sandbox's own when it is set", async () => {
    expect(await (await GET()).json()).toEqual({ givingLinkSlug: "IPHa4RsF8WlK" });
    process.env.SCORECARD_GIVING_LINK_SLUG = "sandboxSlug123";
    const res = await GET();
    expect(await res.json()).toEqual({ givingLinkSlug: "sandboxSlug123" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("the scorecard pages", () => {
  it.each(["index.html", "tryagain/index.html"])("%s holds no giving-link slug; the button comes from the server's setting", (page) => {
    const html = read(page);
    expect(html).not.toContain("IPHa4RsF8WlK");
    expect(html).toContain("data-scorecard-giving");
    expect(html).toContain("/scorecard/giving-button.js");
  });

  it("the button loader reads the slug from the config route and adds the giving embed in button mode", () => {
    const js = read("giving-button.js");
    expect(js).toContain("/api/scorecard/config");
    expect(js).toContain("/embed/wgc-giving.js");
    expect(js).toContain('"data-wgc-mode", "button"');
    expect(js).not.toContain("IPHa4RsF8WlK");
  });
});
