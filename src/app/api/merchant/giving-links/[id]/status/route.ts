import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";

const ALLOWED = new Set(["ACTIVE", "INACTIVE", "ARCHIVED"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const { status } = await req.json();

  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.givingLink.findFirst({ where: { id, churchId: auth.churchId } });
  if (!existing) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  const link = await prisma.givingLink.update({ where: { id }, data: { status } });
  return NextResponse.json({ link });
}
