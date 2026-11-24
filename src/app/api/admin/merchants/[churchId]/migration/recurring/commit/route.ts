import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildRecurringPreview } from "@/lib/migrations/recurringImport";
import { ATTESTATION_TEXT, alreadyImportedFingerprints, createRecurringImportJob } from "@/lib/migrations/recurringImportRun";
import { markScheduleSubmissionUsed } from "@/lib/migrations/recurringSubmission";
import { buildFundMap, requireRecurringImportAdmin } from "@/lib/migrations/recurringImportAuth";

/** Creates the import job from files that were previewed. Re-checks everything server side; creates no charges. */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const auth = await requireRecurringImportAdmin();
  if ("response" in auth) return auth.response;
  const { churchId } = await params;

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } });
  if (!church) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (body.attestation !== true) return NextResponse.json({ error: "Confirm the donor-permission statement before importing." }, { status: 400 });
  const scheduleCsv = typeof body.scheduleCsv === "string" ? body.scheduleCsv : "";
  const mappingCsv = typeof body.mappingCsv === "string" ? body.mappingCsv : "";
  if (!scheduleCsv.trim() || !mappingCsv.trim()) return NextResponse.json({ error: "Both files are required." }, { status: 400 });

  const { fundMap } = await buildFundMap(churchId, body.fundMap);
  const preview = buildRecurringPreview({ churchId, scheduleCsv, mappingCsv, fundMap, alreadyImported: await alreadyImportedFingerprints(churchId) });
  if (preview.fileErrors.length > 0) return NextResponse.json({ error: preview.fileErrors.join(" ") }, { status: 400 });

  try {
    const { jobId, importable } = await createRecurringImportJob({
      churchId,
      actor: auth.actor,
      fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 200) : null,
      preview,
      attestation: { text: ATTESTATION_TEXT, confirmedAt: new Date().toISOString() },
      fundMap,
    });
    if (typeof body.submissionId === "string" && body.submissionId) await markScheduleSubmissionUsed(body.submissionId, churchId, jobId);
    return NextResponse.json({ jobId, importable, counts: preview.counts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create the import." }, { status: 400 });
  }
}
