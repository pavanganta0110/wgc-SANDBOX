import { NextResponse } from "next/server";
import { runSyncJob } from "@/lib/finix/sync/runSyncJob";

export async function POST(req: Request) {
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
