import { NextResponse } from "next/server";
import { cancelImportedSubscriptions, getRecurringJobProgress } from "@/lib/migrations/recurringImportRun";
import { requireRecurringImportAdmin } from "@/lib/migrations/recurringImportAuth";

export const maxDuration = 60;

/** Undo: cancels the subscriptions this job created (a few per call; the screen repeats until none remain). */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string; jobId: string }> }) {
  const auth = await requireRecurringImportAdmin();
  if ("response" in auth) return auth.response;
  const { churchId, jobId } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  try {
    const result = await cancelImportedSubscriptions(jobId, churchId, auth.actor, reason);
    return NextResponse.json({ result, progress: await getRecurringJobProgress(jobId, churchId) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not cancel." }, { status: 400 });
  }
}
