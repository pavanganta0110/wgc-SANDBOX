import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDonorSession, DonorAuthError, findPortalDonorsByEmail } from "@/lib/donorPortal/donorAuth";
import { renderStatementPdf } from "@/lib/donors/generateStatement";

/** PDF download of a statement the church has already generated. Ownership is re-derived from the session on every request. */
export async function GET(req: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const slug = new URL(req.url).searchParams.get("slug") ?? "";

  let session;
  try {
    session = await requireDonorSession(slug);
  } catch (err) {
    if (err instanceof DonorAuthError) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    throw err;
  }

  const sessionDonor = await prisma.donor.findFirst({ where: { id: session.donorId, churchId: session.churchId }, select: { email: true } });
  const donorIds = sessionDonor?.email ? (await findPortalDonorsByEmail(session.churchId, sessionDonor.email)).map((d) => d.id) : [];

  const statement = await prisma.annualDonationStatement.findFirst({
    where: { id: statementId, churchId: session.churchId, donorId: { in: donorIds }, statementStatus: { in: ["READY", "GENERATED"] }, supersededAt: null, generatedAt: { not: null } },
    select: { id: true, taxYear: true },
  });
  if (!statement) return NextResponse.json({ error: "Statement not found." }, { status: 404 });

  const pdf = await renderStatementPdf(statement.id, session.churchId);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="giving-statement-${statement.taxYear}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
