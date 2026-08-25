import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { parseReportDefinition, ReportValidationError, savedReportNameSchema, savedReportVisibilitySchema } from "@/lib/reporting/validation";

/**
 * Ownership rule (item 14/18): the creator may always rename/edit/delete
 * their own saved report, regardless of visibility. An owner/admin with
 * canManageSavedReports may also manage an ORGANIZATION-visibility report
 * created by someone else (team-level report library), but never another
 * user's still-PRIVATE report — that stays exclusively theirs.
 */
async function loadAuthorizedReport(churchId: string, userId: string, canManageOrgReports: boolean, id: string) {
  const report = await prisma.savedReport.findFirst({ where: { id, churchId } });
  if (!report) return { report: null, allowed: false };
  const allowed = report.createdByUserId === userId || (report.visibility === "ORGANIZATION" && canManageOrgReports);
  return { report, allowed };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageSavedReports");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { report, allowed } = await loadAuthorizedReport(auth.churchId, auth.userId, true, id);
  if (!report) return NextResponse.json({ error: "Saved report not found." }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "You don't have permission to edit this saved report." }, { status: 403 });

  let body: { name?: unknown; visibility?: unknown; configuration?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const nameResult = savedReportNameSchema.safeParse(body.name);
    if (!nameResult.success) return NextResponse.json({ error: nameResult.error.issues[0]?.message ?? "Invalid name." }, { status: 400 });
    data.name = nameResult.data;
  }
  if (body.visibility !== undefined) {
    const visibilityResult = savedReportVisibilitySchema.safeParse(body.visibility);
    if (!visibilityResult.success) return NextResponse.json({ error: "Invalid visibility." }, { status: 400 });
    data.visibility = visibilityResult.data;
  }
  if (body.configuration !== undefined) {
    try {
      const definition = parseReportDefinition(body.configuration);
      data.configuration = definition;
      data.reportType = definition.reportType;
    } catch (err) {
      if (err instanceof ReportValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  }

  const updated = await prisma.savedReport.update({ where: { id }, data: data as never });
  return NextResponse.json({ report: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageSavedReports");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { report, allowed } = await loadAuthorizedReport(auth.churchId, auth.userId, true, id);
  if (!report) return NextResponse.json({ error: "Saved report not found." }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "You don't have permission to delete this saved report." }, { status: 403 });

  await prisma.savedReport.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
