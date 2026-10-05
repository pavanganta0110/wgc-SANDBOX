import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/** Lowercase, hyphenated, ASCII-only — "Spring Gala 2026!" → "spring-gala-2026". */
export function slugifyEventName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "event"
  );
}

/**
 * Public slugs are global (they're the whole URL), so a short random suffix
 * keeps two merchants' "Annual Dinner" from colliding and makes the URL
 * unguessable enough that a DRAFT event's slug can't be enumerated.
 */
export async function generateEventSlug(name: string): Promise<string> {
  const base = slugifyEventName(name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = `${base}-${crypto.randomBytes(3).toString("hex")}`;
    const existing = await prisma.event.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
  return `${base}-${crypto.randomBytes(6).toString("hex")}`;
}
