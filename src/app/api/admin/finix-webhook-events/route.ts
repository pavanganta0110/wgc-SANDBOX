import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Read-only viewer for FinixWebhookEvent — every raw webhook Finix has
 * sent, previously write-only (nothing ever read this table). Built to
 * answer "why did this merchant get an email/status change" without
 * needing direct database access: search by merchantId to see every
 * event Finix actually sent for that merchant, in order.
 */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const merchantId = searchParams.get("merchantId")?.trim();
  const type = searchParams.get("type");
  const processingStatus = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const sort = searchParams.get("sort") === "oldest" ? "asc" : "desc";

  const where: Record<string, unknown> = {};
  if (merchantId) where.merchantId = merchantId;
  if (type && type !== "ALL") where.type = type;
  if (processingStatus && processingStatus !== "ALL") where.processingStatus = processingStatus;
  if (q) {
    where.OR = [
      { merchantId: { contains: q, mode: "insensitive" } },
      { finixEventId: { contains: q, mode: "insensitive" } },
      { type: { contains: q, mode: "insensitive" } },
    ];
  }

  const [events, types] = await Promise.all([
    prisma.finixWebhookEvent.findMany({ where, orderBy: { createdAt: sort }, take: 200 }),
    prisma.finixWebhookEvent.findMany({ distinct: ["type"], select: { type: true }, orderBy: { type: "asc" } }),
  ]);

  return NextResponse.json({ events, types: types.map((t) => t.type) });
}
