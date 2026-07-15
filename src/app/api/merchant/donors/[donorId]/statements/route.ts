import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { generateYearEndStatement } from "@/lib/donors/generateStatement";

export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { donorId } = await params;
  const statements = await prisma.annualDonationStatement.findMany({
    where: { donorId, churchId: session.churchId },
    orderBy: [{ taxYear: "desc" }, { version: "desc" }],
  });
  return NextResponse.json({ statements });
}

export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canGenerateStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { donorId } = await params;
  const body = await req.json();
  const taxYear = parseInt(body.taxYear, 10);
  if (!taxYear || taxYear < 2000 || taxYear > 2100) {
    return NextResponse.json({ error: "Invalid tax year" }, { status: 400 });
  }

  try {
    const result = await generateYearEndStatement(donorId, session.churchId, taxYear, session.userId, { forceNewVersion: body.forceNewVersion === true });

    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
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
