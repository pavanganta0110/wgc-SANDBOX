import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { syncAuthorizations } from "@/lib/finix/sync/syncAuthorizations";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ error: "No Finix merchant configured for this church" }, { status: 400 });
  }

  try {
    const result = await syncAuthorizations(church.finixMerchantId, church.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Authorization sync failed:", error);
    return NextResponse.json({ error: error?.message ?? "Sync failed" }, { status: 500 });
  }
}
