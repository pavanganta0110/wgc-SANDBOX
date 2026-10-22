/** PNG/JPEG bytes ready for @react-pdf's <Image src>. */
export type PdfImage = { data: Buffer; format: "png" | "jpg" };

const IMAGE_FETCH_TIMEOUT_MS = 4000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Only images in WGC's own Supabase storage are fetched: the branding settings
 * accept any https URL, and the server must never fetch arbitrary URLs.
 */
export function isOwnStorageUrl(url: string): boolean {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === new URL(base).host && u.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

/** PNG / JPEG by magic bytes; anything else (WebP, SVG, GIF…) is unsupported by @react-pdf. */
export function sniffImageFormat(data: Buffer): "png" | "jpg" | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  return null;
}

/**
 * Loads a church-uploaded image (logo, signature) for a PDF. @react-pdf can
 * only draw PNG and JPEG, and an image it can't decode draws a blank box or
 * fails the whole document. The branding uploader also accepts WebP, so the
 * image is fetched here and only kept when it's really PNG/JPEG; anything else
 * (or a slow/failed fetch) just drops the image, never the document.
 *
 * Pass a `cache` when rendering many documents for one church (e.g. combined
 * statements) so the same image is fetched once.
 */
export function loadPdfImage(url: string | null | undefined, cache?: Map<string, Promise<PdfImage | null>>): Promise<PdfImage | null> {
  if (!url) return Promise.resolve(null);
  const cached = cache?.get(url);
  if (cached) return cached;
  const loading = fetchPdfImage(url);
  cache?.set(url, loading);
  return loading;
}

async function fetchPdfImage(url: string): Promise<PdfImage | null> {
  if (!isOwnStorageUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS), redirect: "error" });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return null;
    // Trust the bytes, not the stored content-type (it comes from the
    // uploader's browser, and a JPEG named .png renders as a blank box).
    const format = sniffImageFormat(data);
    return format ? { data, format } : null;
  } catch {
    return null;
  }
}
