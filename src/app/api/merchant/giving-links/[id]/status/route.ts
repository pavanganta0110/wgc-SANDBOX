import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const ALLOWED = new Set(["ACTIVE", "INACTIVE", "ARCHIVED"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { status } = await req.json();

  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.givingLink.findFirst({ where: { id, churchId: session.churchId } });
  if (!existing) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  const link = await prisma.givingLink.update({ where: { id }, data: { status } });
  return NextResponse.json({ link });
}
