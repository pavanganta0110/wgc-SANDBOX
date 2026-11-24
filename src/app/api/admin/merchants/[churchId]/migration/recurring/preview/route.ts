import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildRecurringPreview } from "@/lib/migrations/recurringImport";
import { alreadyImportedFingerprints } from "@/lib/migrations/recurringImportRun";
import { buildFundMap, requireRecurringImportAdmin } from "@/lib/migrations/recurringImportAuth";

/** Dry run: parses and checks both files and says what would happen. Creates nothing and calls nothing. */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const auth = await requireRecurringImportAdmin();
  if ("response" in auth) return auth.response;
  const { churchId } = await params;

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } });
  if (!church) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const scheduleCsv = typeof body.scheduleCsv === "string" ? body.scheduleCsv : "";
  const mappingCsv = typeof body.mappingCsv === "string" ? body.mappingCsv : "";
  if (!scheduleCsv.trim() || !mappingCsv.trim()) return NextResponse.json({ error: "Upload both the schedule file and the Finix mapping file." }, { status: 400 });

  const { funds, fundMap } = await buildFundMap(churchId, body.fundMap);
  const preview = buildRecurringPreview({ churchId, scheduleCsv, mappingCsv, fundMap, alreadyImported: await alreadyImportedFingerprints(churchId) });
  return NextResponse.json({ preview, funds, fundMap });
}
