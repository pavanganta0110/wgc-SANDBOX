import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { renderStatementPdf } from "@/lib/donors/generateStatement";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

// Gated by the organization's own authenticated session — no public secure
// token/link system here. Simpler than a signed-URL scheme, and access
// control is exactly as strong: only an authenticated admin of this
// donor's own organization can ever reach this route.
export async function GET(req: Request, { params }: { params: Promise<{ donorId: string; statementId: string }> }) {
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

  const { donorId, statementId } = await params;
  const statement = await prisma.annualDonationStatement.findFirst({ where: { id: statementId, donorId, churchId: auth.churchId } });
  if (!statement) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const inline = searchParams.get("inline") === "1";

  try {
    const pdf = await renderStatementPdf(statementId, auth.churchId);

    // Preview (inline) requests are not logged as a download — they're a
    // distinct, lighter-weight audit action so "how many times was this
    // actually saved to disk" stays meaningful.
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: inline ? "statement.previewed" : "statement.downloaded",
      entityType: "donor",
      entityId: donorId,
      metadata: { statementId },
      req,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${statement.taxYear}-donation-statement.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
