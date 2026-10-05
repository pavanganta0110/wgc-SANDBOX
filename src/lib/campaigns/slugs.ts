import crypto from "crypto";

/** Lowercase, hyphenated, alphanumeric-only slug base from a display name. */
function slugifyBase(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "campaign";
}

/**
 * Generates a human-readable, unique slug for a public fundraising URL
 * (e.g. "spring-gala-2026", "john-smith") — distinct from
 * GivingLink.publicSlug's random-token convention, since these are shared
 * on flyers/QR codes/social media. Appends a short random suffix only on a
 * collision, so the common case (unique name) gets a clean URL.
 */
export async function generateUniqueSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugifyBase(name);
  if (!(await exists(base))) return base;

  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = crypto.randomBytes(3).toString("hex");
    const candidate = `${base}-${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }

  // Astronomically unlikely fallback — guarantees termination.
  return `${base}-${crypto.randomBytes(6).toString("hex")}`;
}
