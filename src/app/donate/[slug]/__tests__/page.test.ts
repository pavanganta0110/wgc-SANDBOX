import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockLoad = vi.fn();
vi.mock("@/lib/givingLinks/loadOrganizationGivingPage", () => ({ loadOrganizationGivingPage: (...a: unknown[]) => mockLoad(...a) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/components/giving/GivingLinkForm", () => ({
  default: (p: { slug: string; churchName: string }) => createElement("div", null, `FORM:${p.slug}:${p.churchName}`),
}));
vi.mock("@/components/merchant/OrganizationBrandHeader", () => ({
  default: (p: { organizationName: string }) => createElement("header", null, `BRAND:${p.organizationName}`),
}));
vi.mock("@/components/merchant/PoweredByWgc", () => ({ default: () => createElement("footer", null, "POWERED") }));

const okPage = (over: Record<string, unknown> = {}) => ({
  ok: true,
  linkSlug: "LINK1",
  data: {
    light: { pageBackground: "#fff", borderColor: "#ddd", headerBackground: "#fff", headingColor: "#000", bodyTextColor: "#333" },
    church: { name: "Faith Academy", finixMerchantId: "MU1", website: "https://faith.example.org" },
    link: { publicTitle: "Give to Faith", description: "Thank you", amountType: "VARIABLE" },
    branding: { showPoweredByWgc: true },
    logoUrl: null,
    ...over,
  },
});

async function render(slug = "faith", sp: { link?: string } = {}) {
  const { default: Page } = await import("../page");
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(sp) }));
}

describe("/donate/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("renders the org brand, page title and the real giving form", async () => {
    mockLoad.mockResolvedValue(okPage());
    const html = await render();
    expect(html).toContain("BRAND:Faith Academy");
    expect(html).toContain("Give to Faith");
    expect(html).toContain("FORM:LINK1:Faith Academy");
    expect(html).toContain("POWERED");
  });

  it("passes the ?link= preference to the loader", async () => {
    mockLoad.mockResolvedValue(okPage());
    await render("faith", { link: "LINK2" });
    expect(mockLoad).toHaveBeenCalledWith("faith", "LINK2");
  });

  it("is a 404 when the organization has nothing it can accept gifts through", async () => {
    mockLoad.mockResolvedValue({ ok: false, notFound: true });
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("only links the organization's website when it is an http(s) address", async () => {
    mockLoad.mockResolvedValue(okPage({ church: { name: "X", finixMerchantId: "MU1", website: "javascript:alert(1)" } }));
    expect(await render()).not.toContain("javascript:");
    mockLoad.mockResolvedValue(okPage());
    expect(await render()).toContain('href="https://faith.example.org"');
  });
});
