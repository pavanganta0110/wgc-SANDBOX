import { prisma } from "@/lib/prisma";

/** What a church-branded export shows at the top: the organization, never WGC. */
export interface OrganizationBranding {
  name: string;
  /** PNG/JPEG bytes ready for @react-pdf's <Image>, or null (no logo / unsupported format / fetch failed). */
  logo: { data: Buffer; format: "png" | "jpg" } | null;
  address: string | null;
  contact: string | null;
}

const LOGO_FETCH_TIMEOUT_MS = 4000;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Only logos in WGC's own Supabase storage are fetched: the branding settings
 * accept any https URL, and the server must never fetch arbitrary URLs.
 */
function isOwnStorageUrl(url: string): boolean {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === new URL(base).host && u.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

/**
 * @react-pdf can only draw PNG and JPEG, and a logo it can't decode fails the
 * whole document. The branding uploader also accepts WebP, so the logo is
 * fetched here and only kept when it's really PNG/JPEG; anything else (or a
 * slow/failed fetch) just drops the logo, never the export.
 */
async function loadLogo(url: string | null): Promise<OrganizationBranding["logo"]> {
  if (!url || !isOwnStorageUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS), redirect: "error" });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > MAX_LOGO_BYTES) return null;
    // Trust the bytes, not the stored content-type (it comes from the
    // uploader's browser, and a JPEG named .png renders as a blank box).
    const format = sniffImageFormat(data);
    return format ? { data, format } : null;
  } catch {
    return null;
  }
}

/** PNG / JPEG by magic bytes; anything else (WebP, SVG, GIF…) is unsupported by @react-pdf. */
export function sniffImageFormat(data: Buffer): "png" | "jpg" | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  return null;
}

export async function loadOrganizationBranding(churchId: string): Promise<OrganizationBranding | null> {
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: {
      name: true,
      statementSenderName: true,
      logoUrl: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      supportEmail: true,
      primaryContactEmail: true,
      website: true,
    },
  });
  if (!church) return null;
  const cityLine = [[church.city, church.state].filter(Boolean).join(", "), church.postalCode].filter(Boolean).join(" ");
  const address = [church.addressLine1, church.addressLine2, cityLine].filter(Boolean).join(", ") || null;
  const contact = [church.supportEmail || church.primaryContactEmail, church.phone, church.website].filter(Boolean).join(" · ") || null;
  return {
    name: church.statementSenderName || church.name,
    logo: await loadLogo(church.logoUrl),
    address,
    contact,
  };
}
