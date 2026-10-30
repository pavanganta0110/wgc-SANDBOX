import { prisma } from "@/lib/prisma";

/** Link requests one key may make per minute. Held in the database, so it holds across servers. */
export const EMBED_LINKS_PER_MINUTE = 60;
const KEEP_REQUEST_RECORDS_DAYS = 30;

/** Records one request for a CRM-frame link, unless the key has already used its minute. Never holds the person's email. */
export async function recordEmbedLinkRequest(params: { partnerId: string; partnerKeyId: string; reference: string }): Promise<"recorded" | "too_many"> {
  const recent = await prisma.partnerEmbedLinkRequest.count({ where: { partnerKeyId: params.partnerKeyId, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  if (recent >= EMBED_LINKS_PER_MINUTE) return "too_many";
  await prisma.partnerEmbedLinkRequest.create({ data: params });
  // Records are kept for a month for the admin's view, then cleared. Never blocks the request.
  if (Math.random() < 0.02) {
    void prisma.partnerEmbedLinkRequest
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_REQUEST_RECORDS_DAYS * 24 * 60 * 60 * 1000) } } })
      .catch(() => undefined);
  }
  return "recorded";
}
