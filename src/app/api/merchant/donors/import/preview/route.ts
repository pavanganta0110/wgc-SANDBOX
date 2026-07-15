import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { buildImportPreview, IMPORT_ROW_CAP } from "@/lib/donors/csvImport";

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const csvText: string = typeof body.csvText === "string" ? body.csvText : "";
  if (!csvText.trim()) {
    return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  }

  const existingDonors = await prisma.donor.findMany({
    where: { churchId: session.churchId, archivedAt: null, normalizedEmail: { not: null } },
    select: { normalizedEmail: true },
  });
  const existingNormalizedEmails = new Set(existingDonors.map((d) => d.normalizedEmail!));

  const rows = buildImportPreview(csvText, existingNormalizedEmails);

  return NextResponse.json({
    rows,
    totalRows: rows.length,
    cappedAt: rows.length === IMPORT_ROW_CAP ? IMPORT_ROW_CAP : null,
    summary: {
      valid: rows.filter((r) => r.status === "valid").length,
      error: rows.filter((r) => r.status === "error").length,
      duplicateInFile: rows.filter((r) => r.status === "duplicate_in_file").length,
      duplicateInOrg: rows.filter((r) => r.status === "duplicate_in_org").length,
    },
  });
}
