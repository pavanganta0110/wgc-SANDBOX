import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { renderStatementPdf } from "@/lib/donors/generateStatement";

// Gated by the organization's own authenticated session — no public secure
// token/link system here. Simpler than a signed-URL scheme, and access
// control is exactly as strong: only an authenticated admin of this
// donor's own organization can ever reach this route.
export async function GET(req: Request, { params }: { params: Promise<{ donorId: string; statementId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId, statementId } = await params;
  const statement = await prisma.annualDonationStatement.findFirst({ where: { id: statementId, donorId, churchId: session.churchId } });
  if (!statement) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const inline = searchParams.get("inline") === "1";

  try {
    const pdf = await renderStatementPdf(statementId, session.churchId);

    // Preview (inline) requests are not logged as a download — they're a
    // distinct, lighter-weight audit action so "how many times was this
    // actually saved to disk" stays meaningful.
    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
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
