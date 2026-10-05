import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { renderCombinedStatementsPdf } from "@/lib/donors/generateStatement";

/** Statements per downloadable PDF — keeps rendering inside a serverless time/memory budget. Larger years download in numbered parts. */
const STATEMENTS_PER_PART = 100;

/**
 * GET ?year=YYYY[&part=N][&meta=1][&mailableOnly=0]
 *
 * One print-ready PDF of every already-generated statement for the year,
 * sorted by donor name, each statement starting on its own page. By
 * default only donors with a mailing address on file are included (this is
 * the "print and mail" run); pass mailableOnly=0 to include everyone.
 * meta=1 returns just the counts the UI needs to offer the right number of
 * parts. Statements must be generated first — this never creates one.
 */
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canView || !permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "", 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "A valid year is required." }, { status: 400 });
  }
  const mailableOnly = searchParams.get("mailableOnly") !== "0";

  const statements = await prisma.annualDonationStatement.findMany({
    where: { churchId: auth.churchId, taxYear: year, supersededAt: null },
    select: { id: true, donorNameSnapshot: true, donorAddressSnapshot: true },
  });
  const printable = statements
    .filter((s) => {
      if (!mailableOnly) return true;
      const a = s.donorAddressSnapshot as { line1?: string | null } | null;
      return Boolean(a?.line1);
    })
    .sort((a, b) => (a.donorNameSnapshot || "").localeCompare(b.donorNameSnapshot || ""));

  const parts = Math.max(1, Math.ceil(printable.length / STATEMENTS_PER_PART));
  if (searchParams.get("meta") === "1") {
    return NextResponse.json({ year, statements: printable.length, parts, perPart: STATEMENTS_PER_PART, mailableOnly });
  }
  if (printable.length === 0) {
    return NextResponse.json({ error: "No generated statements with a mailing address for this year. Generate statements first." }, { status: 404 });
  }

  const part = Math.min(Math.max(parseInt(searchParams.get("part") || "1", 10) || 1, 1), parts);
  const slice = printable.slice((part - 1) * STATEMENTS_PER_PART, part * STATEMENTS_PER_PART);
  const pdf = await renderCombinedStatementsPdf(slice.map((s) => s.id), auth.churchId);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "statement.combined_pdf_downloaded",
    entityType: "donor",
    metadata: { taxYear: year, part, parts, statements: slice.length, mailableOnly },
    req,
  });

  const suffix = parts > 1 ? `-part-${part}-of-${parts}` : "";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="donor-statements-${year}${suffix}.pdf"`,
    },
  });
}
