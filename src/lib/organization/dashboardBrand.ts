/**
 * The organization's own look on its dashboard (logo + colors from
 * Settings → Branding), shown only when WGC staff turned on "Branded
 * dashboard" for that organization. Everything is validated before it can
 * reach markup or an inline style, so a bad saved value is dropped rather
 * than rendered.
 */
export interface DashboardBrand {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function validColor(value: string | null | undefined): string | null {
  return value && HEX_COLOR.test(value.trim()) ? value.trim() : null;
}

function validLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveDashboardBrand(church: {
  brandedDashboard?: boolean | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
}): DashboardBrand | null {
  if (!church.brandedDashboard) return null;
  return {
    logoUrl: validLogoUrl(church.logoUrl),
    primaryColor: validColor(church.primaryColor),
    accentColor: validColor(church.accentColor),
  };
}
