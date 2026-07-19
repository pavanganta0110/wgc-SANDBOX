import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { buildImportPreview, IMPORT_ROW_CAP } from "@/lib/donors/csvImport";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const csvText: string = typeof body.csvText === "string" ? body.csvText : "";
  if (!csvText.trim()) {
    return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  }

  const existingDonors = await prisma.donor.findMany({
    where: { churchId: auth.churchId, archivedAt: null, normalizedEmail: { not: null } },
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
