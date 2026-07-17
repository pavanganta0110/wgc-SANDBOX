import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const sort = searchParams.get("sort") === "oldest" ? "asc" : "desc";

  const where: any = {};
  if (status && status !== "ALL") where.status = status;
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  const inquiries = await prisma.contactInquiry.findMany({
    where,
    orderBy: { createdAt: sort },
  });
  return NextResponse.json({ inquiries });
}
