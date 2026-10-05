import { NextResponse } from "next/server";
import { runSyncJob } from "@/lib/finix/sync/runSyncJob";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Admin-triggered merchant snapshot sync. middleware.ts's cookie check
 * alone is signature/expiry-only — it never revokes a disabled admin's or
 * a just-password-reset admin's existing session — so this route verifies
 * a real, DB-backed admin session itself via getAdminSession().
 */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { finixMerchantId, churchId } = await req.json();

    if (!finixMerchantId) {
      return NextResponse.json({ error: "Missing finixMerchantId" }, { status: 400 });
    }

    const result = await runSyncJob({ jobType: "merchant", finixMerchantId, churchId });
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Merchant sync failed:", error);
    return NextResponse.json({ error: error?.message ?? "Sync failed" }, { status: 500 });
  }
}
