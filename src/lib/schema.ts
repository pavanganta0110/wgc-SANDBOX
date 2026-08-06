// Single source of truth for site-wide Schema.org entities.
//
// Everything references these @id values instead of re-declaring the
// organization, which previously appeared twice under two different spellings
// ("Way Point Gateway Collective" and "Waypoint Gateway Collective (WGC)").

export const SITE = "https://www.wgcpayments.com";
export const ORG_ID = `${SITE}/#organization`;
export const SITE_ID = `${SITE}/#website`;

// Legal name — keep this spelling everywhere (schema, copy, footer).
export const ORG_NAME = "Waypoint Gateway Collective";

export const organization = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: ORG_NAME,
  alternateName: "WGC",
  url: SITE,
  logo: { "@type": "ImageObject", url: `${SITE}/wgc-brand-final.png` },
  email: "support@wgcpayments.com",
  description:
    "Payment infrastructure for software that serves churches, nonprofits, and other 501(c) organizations.",
  // TODO(nap): add streetAddress / addressLocality / postalCode / telephone.
  // Required for local pack eligibility on the /kansas-city/* pages. Left out
  // deliberately rather than guessed — see ACTION-PLAN.md 3.4.
};

export const website = {
  "@type": "WebSite",
  "@id": SITE_ID,
  url: SITE,
  name: ORG_NAME,
  publisher: { "@id": ORG_ID },
};

/**
 * Site-wide graph. Emitted ONCE from the root layout — it carries the shared
 * Organization and WebSite entities that everything else references by @id.
 */
export function graph(...nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": [organization, website, ...nodes] };
}

/**
 * Page-level graph. Deliberately omits Organization and WebSite: the root
 * layout already emits them, and repeating them here produced two copies of
 * each entity on every page that added its own schema.
 */
export function pageGraph(...nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** BreadcrumbList from [{name, path}] pairs. */
export function breadcrumbs(trail: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE}${t.path}`,
    })),
  };
}

/** Article node for the resource guides. */
export function article(o: {
  headline: string; description: string; path: string;
  published: string; modified: string;
}) {
  return {
    "@type": "Article",
    headline: o.headline,
    description: o.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}${o.path}` },
    datePublished: o.published,
    dateModified: o.modified,
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    image: `${SITE}/og/default.png`,
  };
}

/** LocalBusiness node — only for the Kansas City pages, not site-wide. */
export const kansasCityBusiness = {
  "@type": "ProfessionalService",
  "@id": `${SITE}/#kansas-city`,
  name: ORG_NAME,
  parentOrganization: { "@id": ORG_ID },
  url: SITE,
  email: "support@wgcpayments.com",
  priceRange: "$$",
  areaServed: { "@type": "City", name: "Kansas City", addressRegion: "MO" },
  // TODO(nap): address + telephone required here for map pack eligibility.
};
