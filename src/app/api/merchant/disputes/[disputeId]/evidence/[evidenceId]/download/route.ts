import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";

/**
 * Proxies the evidence file back through our own server so the browser
 * never talks to the processor directly and never sees processor
 * credentials — same reasoning as the rest of this app's server-side
 * Finix calls. See getDisputeEvidenceFile() for the retrieval-endpoint
 * caveat: it's a best-effort guess, not a confirmed Finix API.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ disputeId: string; evidenceId: string }> }
) {
  const session = await getSession();
  const permissions = getDisputePermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { disputeId, evidenceId } = await params;
  const dispute = await prisma.finixDispute.findFirst({
    where: { finixDisputeId: disputeId, churchId: session.churchId },
  });
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  const evidence = await prisma.disputeEvidence.findFirst({
    where: { id: evidenceId, disputeId: dispute.id },
  });
  if (!evidence || !evidence.finixFileId) {
    return NextResponse.json({ error: "Evidence file not found" }, { status: 404 });
  }

  try {
    const file = await finixClient.getDisputeEvidenceFile(dispute.finixDisputeId, evidence.finixFileId);
    return new NextResponse(file.data, {
      headers: {
        "Content-Type": file.contentType || evidence.mimeType,
        "Content-Disposition": `attachment; filename="${evidence.fileName}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Could not download this file" }, { status: 502 });
  }
}
