import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { loadAdminTicketQueue } from "@/lib/support/adminTicketQueue";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const result = await loadAdminTicketQueue(
    {
      status: searchParams.get("status") || undefined,
      priority: searchParams.get("priority") || undefined,
      category: searchParams.get("category") || undefined,
      churchId: searchParams.get("churchId") || undefined,
      assignedToAdminUserId: searchParams.get("assignedTo") || undefined,
      search: searchParams.get("q") || undefined,
    },
    page
  );

  return NextResponse.json(result);
}
