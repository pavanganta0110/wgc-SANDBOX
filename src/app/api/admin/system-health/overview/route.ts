import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { getSystemHealthOverview } from "@/lib/monitoring/overviewStats";

/**
 * Global-admin-only. Read-only — no mutation endpoints live under
 * /api/admin/system-health/**. See src/lib/monitoring/overviewStats.ts and
 * serviceStatus.ts for exactly which numbers are real today vs. Unknown
 * pending Phase 3/4 monitoring.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const overview = await getSystemHealthOverview();
  return NextResponse.json(overview);
}
