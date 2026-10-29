import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";

/** Organizations by name, for the "link an organization" picker. */
export async function GET(req: Request) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ churches: [] });

  const churches = await prisma.church.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, partnerId: true },
    orderBy: { name: "asc" },
    take: 15,
  });
  return NextResponse.json({ churches: churches.map((c) => ({ id: c.id, name: c.name, linked: Boolean(c.partnerId) })) });
}
