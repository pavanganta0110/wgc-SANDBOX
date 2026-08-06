import type { MetadataRoute } from "next";

const BASE = "https://www.wgcpayments.com";

// Public, indexable routes only. Merchant, admin, onboarding, demo, embed and
// per-org giving pages are deliberately excluded.
const ROUTES = [
  "",
  "/how-it-works",
  "/pricing",
  "/about",
  "/contact",
  "/software-partners",
  "/developers",
  "/start",
  "/resources",
  "/resources/church-payment-processing-guide-2026",
  "/resources/church-payment-processing-pricing-guide",
  "/resources/white-label-payment-processing-nonprofit-church-software",
  "/for/churches",
  "/for/christian-nonprofits",
  "/for/schools",
  "/for/government",
  "/for/nonprofits",
  "/kansas-city/church-payment-processing",
  "/kansas-city/nonprofit-payment-processing",
  "/kansas-city/tithely-alternative",
  "/legal/privacy",
  "/legal/terms",
  "/legal/fees",
  "/legal/compliance",
];

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
