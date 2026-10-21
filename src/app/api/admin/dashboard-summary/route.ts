import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { loadAdminOpsSummary } from "@/lib/admin/opsSummary";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await loadAdminOpsSummary());
}
