import { NextResponse } from "next/server";
import { processRecurringImportChunk } from "@/lib/migrations/recurringImportRun";
import { requireRecurringImportAdmin } from "@/lib/migrations/recurringImportAuth";

export const maxDuration = 60;

/** Imports the next few rows. The screen calls this until nothing is left. */
export async function POST(_req: Request, { params }: { params: Promise<{ churchId: string; jobId: string }> }) {
  const auth = await requireRecurringImportAdmin();
  if ("response" in auth) return auth.response;
  const { churchId, jobId } = await params;
  try {
    const progress = await processRecurringImportChunk(jobId, churchId, auth.actor);
    return NextResponse.json({ progress });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "The import could not continue." }, { status: 400 });
  }
}
