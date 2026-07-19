import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { generateYearEndStatement } from "@/lib/donors/generateStatement";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { donorId } = await params;
  const statements = await prisma.annualDonationStatement.findMany({
    where: { donorId, churchId: auth.churchId },
    orderBy: [{ taxYear: "desc" }, { version: "desc" }],
  });
  return NextResponse.json({ statements });
}

export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canGenerateStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { donorId } = await params;
  const body = await req.json();
  const taxYear = parseInt(body.taxYear, 10);
  if (!taxYear || taxYear < 2000 || taxYear > 2100) {
    return NextResponse.json({ error: "Invalid tax year" }, { status: 400 });
  }

  try {
    const result = await generateYearEndStatement(donorId, auth.churchId, taxYear, auth.userId, { forceNewVersion: body.forceNewVersion === true });

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "statement.generated",
      entityType: "donor",
      entityId: donorId,
      metadata: { statementId: result.statementId, taxYear, version: result.version },
      req,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to generate statement" }, { status: 400 });
  }
}
