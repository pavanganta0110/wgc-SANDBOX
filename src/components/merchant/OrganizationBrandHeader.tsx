"use client";

import { useState } from "react";

/**
 * The org-identity block at the top of every public checkout page (Giving
 * Pages, Event Pages): a prominent logo, the organization's name — always,
 * so a page with no logo (or a logo that fails to load) still says whose
 * page it is — and a one-line page kind ("Secure Giving", "Event
 * Registration"). The generic WGC fallback logo is deliberately not shown
 * here; "Powered by WGC" lives at the bottom of the page instead.
 */

const WGC_FALLBACK_LOGO = "/wgc-logo.png";

interface OrganizationBrandHeaderProps {
  logoUrl: string | null;
  organizationName: string;
  /** e.g. "Secure Giving" or "Event Registration". */
  kind: string;
  nameColor?: string;
  kindColor?: string;
  /** Smaller logo, for frames and pages that already lead with a cover image. */
  compact?: boolean;
}

export default function OrganizationBrandHeader({ logoUrl, organizationName, kind, nameColor = "#0f172a", kindColor = "#64748b", compact = false }: OrganizationBrandHeaderProps) {
  const [hasError, setHasError] = useState(false);
  const showLogo = Boolean(logoUrl) && logoUrl !== WGC_FALLBACK_LOGO && !hasError;

  return (
    <header className="flex flex-col items-center text-center mb-6">
      {showLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl!}
          alt={`${organizationName} logo`}
          onError={() => setHasError(true)}
          className="mb-3"
          style={{ width: "auto", height: "auto", maxWidth: compact ? "min(200px, 70%)" : "min(280px, 80%)", maxHeight: compact ? "72px" : "104px", objectFit: "contain" }}
        />
      )}
      <p className="text-lg font-bold leading-tight" style={{ color: nameColor }}>
        {organizationName}
      </p>
      <p className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: kindColor }}>
        {kind}
      </p>
    </header>
  );
}
