import { NextResponse } from "next/server";
import { getRecurringImportReport, getRecurringJobProgress, recurringReportCsv } from "@/lib/migrations/recurringImportRun";
import { requireRecurringImportAdmin } from "@/lib/migrations/recurringImportAuth";

/** The job's progress and per-row report; ?format=csv downloads it. */
export async function GET(req: Request, { params }: { params: Promise<{ churchId: string; jobId: string }> }) {
  const auth = await requireRecurringImportAdmin();
  if ("response" in auth) return auth.response;
  const { churchId, jobId } = await params;
  const report = await getRecurringImportReport(jobId, churchId);
  if (!report) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (new URL(req.url).searchParams.get("format") === "csv") {
    return new NextResponse(recurringReportCsv(report.rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="recurring-import-${jobId}.csv"`, "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ ...report, progress: await getRecurringJobProgress(jobId, churchId) });
}
