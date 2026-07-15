import { NextResponse } from "next/server";
import { runSyncJob } from "@/lib/finix/sync/runSyncJob";

export async function POST(req: Request) {
  try {
    const { finixMerchantId, churchId } = await req.json();

    if (!finixMerchantId) {
      return NextResponse.json({ error: "Missing finixMerchantId" }, { status: 400 });
    }

    const result = await runSyncJob({ jobType: "fees", finixMerchantId, churchId });
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Fees sync failed:", error);
    return NextResponse.json({ error: error?.message ?? "Sync failed" }, { status: 500 });
  }
}
