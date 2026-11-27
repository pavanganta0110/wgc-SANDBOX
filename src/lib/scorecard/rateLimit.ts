import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60_000;

/** The visitor's address as the platform reports it. On Vercel x-real-ip is set by the platform, not the visitor. */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || "unknown").slice(0, 64);
}

/**
 * At most `limit` calls a minute for this visitor and bucket, counted in the database so it holds across serverless
 * instances (AI scoring costs money). Fails closed for the expensive buckets if the database can't be read.
 */
export async function allow(ip: string, bucket: string, limit: number): Promise<boolean> {
  const key = `${bucket}:${ip}`;
  try {
    const since = new Date(Date.now() - WINDOW_MS);
    const recent = await prisma.scorecardRateHit.count({ where: { key, createdAt: { gt: since } } });
    if (recent >= limit) return false;
    await prisma.scorecardRateHit.create({ data: { key } });
    // Tidy up now and then so the table stays small.
    if (Math.random() < 0.02) void prisma.scorecardRateHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 10 * WINDOW_MS) } } }).catch(() => undefined);
    return true;
  } catch (err) {
    console.error("scorecard rate limit failed", err);
    return false;
  }
}
