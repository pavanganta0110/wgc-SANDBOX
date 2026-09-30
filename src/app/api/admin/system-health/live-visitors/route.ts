import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { getLiveVisitorSnapshot } from "@/lib/monitoring/liveVisitors";

/**
 * Global-admin-only. Read-only — see liveVisitors.ts for the PostHog Query
 * API call this wraps. Always returns 200 (even when PostHog isn't
 * configured or the call fails) since "no data available" is a normal,
 * expected state here, not a server error.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snapshot = await getLiveVisitorSnapshot();
  return NextResponse.json(snapshot);
}
