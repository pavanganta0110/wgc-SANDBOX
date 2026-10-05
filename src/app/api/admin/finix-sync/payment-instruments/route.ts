import { NextResponse } from "next/server";
import { runSyncJob } from "@/lib/finix/sync/runSyncJob";
import { getAdminSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { finixMerchantId, finixIdentityId, churchId } = await req.json();

    if (!finixIdentityId) {
      return NextResponse.json({ error: "Missing finixIdentityId" }, { status: 400 });
    }

    const result = await runSyncJob({
      jobType: "paymentInstruments",
      finixMerchantId: finixMerchantId ?? "unknown",
      finixIdentityId,
      churchId,
    });
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Payment instruments sync failed:", error);
    return NextResponse.json({ error: error?.message ?? "Sync failed" }, { status: 500 });
  }
}
