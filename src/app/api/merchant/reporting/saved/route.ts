import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { parseReportDefinition, ReportValidationError, savedReportNameSchema, savedReportVisibilitySchema } from "@/lib/reporting/validation";

/**
 * List: any donor-viewing team member sees their own PRIVATE reports plus
 * every ORGANIZATION-visibility report — never another user's private one.
 * Create requires canManageSavedReports (item 14: "only users with
 * appropriate permissions should manage saved reports").
 */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewDonors");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const reports = await prisma.savedReport.findMany({
    where: {
      churchId: auth.churchId,
      OR: [{ createdByUserId: auth.userId }, { visibility: "ORGANIZATION" }],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, reportType: true, visibility: true, createdByUserId: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ reports });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageSavedReports");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  let body: { name?: unknown; visibility?: unknown; configuration?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const nameResult = savedReportNameSchema.safeParse(body.name);
  if (!nameResult.success) return NextResponse.json({ error: nameResult.error.issues[0]?.message ?? "Invalid name." }, { status: 400 });

  const visibilityResult = savedReportVisibilitySchema.safeParse(body.visibility ?? "PRIVATE");
  if (!visibilityResult.success) return NextResponse.json({ error: "Invalid visibility." }, { status: 400 });

  let definition;
  try {
    definition = parseReportDefinition(body.configuration);
  } catch (err) {
    if (err instanceof ReportValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const report = await prisma.savedReport.create({
    data: {
      churchId: auth.churchId,
      createdByUserId: auth.userId,
      name: nameResult.data,
      reportType: definition.reportType,
      configuration: definition as never,
      visibility: visibilityResult.data,
    },
  });

  return NextResponse.json({ report }, { status: 201 });
}
