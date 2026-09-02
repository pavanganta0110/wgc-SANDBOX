"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const SIMPLIFI_TAG_ID = "2be2d93c-ab3d-4d24-be16-2f8803014632";

/**
 * Public marketing surface only, same rule as MetaPixel — never load on
 * authenticated merchant/admin dashboard activity or inside third-party
 * embeds.
 */
const EXCLUDED_PATH_PREFIXES = ["/merchant", "/admin", "/embed"];

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Simpli.fi site-retargeting pixel. Mirrors this repo's current MetaPixel
 * convention (unconditional load, no cookie-consent gate — production has
 * since added consent gating for MetaPixel that hasn't been ported here). */
export default function SimplifiPixel() {
  const pathname = usePathname();

  if (isExcludedPath(pathname)) {
    return null;
  }

  return <Script id="simplifi-pixel" async strategy="afterInteractive" src={`https://tag.simpli.fi/sifitag/${SIMPLIFI_TAG_ID}`} />;
}
