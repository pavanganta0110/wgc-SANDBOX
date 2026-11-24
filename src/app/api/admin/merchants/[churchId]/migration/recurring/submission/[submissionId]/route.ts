import { NextResponse } from "next/server";
import { getScheduleSubmissionCsv } from "@/lib/migrations/recurringSubmission";
import { requireRecurringImportAdmin } from "@/lib/migrations/recurringImportAuth";

/** The text of a schedule file the merchant sent, so staff can load it into the import wizard. */
export async function GET(_req: Request, { params }: { params: Promise<{ churchId: string; submissionId: string }> }) {
  const auth = await requireRecurringImportAdmin();
  if ("response" in auth) return auth.response;
  const { churchId, submissionId } = await params;
  const found = await getScheduleSubmissionCsv(submissionId, churchId);
  if (!found) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return NextResponse.json(found);
}
