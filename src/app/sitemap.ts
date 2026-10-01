import type { MetadataRoute } from "next";

const BASE = "https://www.wgcpayments.com";

// Public, indexable routes only. Merchant, admin, onboarding, demo, embed and
// per-org giving pages are deliberately excluded.
const ROUTES = [
  "",
  "/how-it-works",
  "/pricing",
  "/compare",
  "/compare/wgc-vs-tithely",
  "/compare/wgc-vs-pushpay",
  "/compare/wgc-vs-givebutter",
  "/compare/wgc-vs-subsplash",
  "/compare/wgc-vs-givelify",
  "/compare/wgc-vs-donorbox",
  "/compare/wgc-vs-planning-center-giving",
  "/compare/wgc-vs-vanco",
  "/compare/wgc-vs-breeze-chms",
  "/features",
  "/demo",
  "/integrations",
  "/switch",
  "/about",
  "/contact",
  "/support",
  "/cancellation-procedure",
  "/90-days-free",
  "/software-partners",
  "/developers",
  "/start",
  "/resources",
  "/resources/church-payment-processing-guide-2026",
  "/resources/nonprofit-payment-processing-guide-2026",
  "/resources/church-payment-processing-pricing-guide",
  "/resources/white-label-payment-processing-nonprofit-church-software",
  "/for/churches",
  "/for/christian-nonprofits",
  "/for/schools",
  "/for/government",
  "/for/foundations",
  "/for/associations",
  "/kansas-city/church-payment-processing",
  "/kansas-city/nonprofit-payment-processing",
  "/kansas-city/tithely-alternative",
  "/kansas-city/school-payment-processing",
  "/kansas-city/government-payment-processing",
  "/legal/privacy",
  "/legal/terms",
  "/legal/fees",
  "/legal/compliance",
  "/legal/sms-consent",
  "/subscription-terms",
];

// Deliberately excluded from this sitemap (checked against every page.tsx
// under src/app as of 2026-10-01, not just the routes someone remembered to
// list here):
//   - Admin/merchant/fundraiser dashboards and their login/token flows —
//     already behind auth or a one-time token; robots.txt disallows them.
//   - Per-organization dynamic pages (/g, /c, /campaign, /embed, /f, /t) —
//     tenant content, not WGC marketing content; each org's own giving/
//     campaign page can be indexed on its own merits, not bulk-listed here.
//   - Token-gated private flows (/invoice, /setup, /activate-subscription,
//     /onboarding/update) — no SEO value and shouldn't be indexed at all.
//   - /first-look(/confirmed), /walkthrough, /churches — a live sales-call
//     funnel, a thin iframe wrapper, and a page superseded by a permanent
//     redirect to /for/churches (next.config.ts) respectively. None are the
//     canonical version of anything worth ranking.

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((route) => ({
    url: `${BASE}${route}`,
    lastModified: now,
    changeFrequency: route.startsWith("/legal") ? "yearly" : "monthly",
    priority:
      route === "" ? 1.0
      : route.startsWith("/for/") || route.startsWith("/kansas-city/") ? 0.8
      : route.startsWith("/legal") ? 0.3
      : 0.6,
  }));
}
