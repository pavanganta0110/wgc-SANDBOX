import { NextResponse } from "next/server";
import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";

/**
 * Resolves which church (if any) actually owns this Finix-hosted file, by
 * checking every model that stores a finixFileId — there is no single
 * central file-ownership table, so this checks each one. Deliberately
 * excludes MerchantDocument (finixFileId on onboarding applications): those
 * exist before a Church row does and are reviewed only by WGC admins
 * elsewhere in this app, never by a merchant session — a merchant getting
 * back `null` here for one of those is correct, not a bug.
 */
async function resolveFileOwnerChurchId(finixFileId: string): Promise<string | null> {
  const [compliance, payout, dispute, supportAttachment] = await Promise.all([
    prisma.complianceForm.findFirst({
      where: { OR: [{ unsignedFileId: finixFileId }, { signedFileId: finixFileId }] },
      select: { churchId: true },
    }),
    prisma.payoutAccountDocument.findFirst({
      where: { finixFileId },
      select: { organizationBankAccount: { select: { churchId: true } } },
    }),
    prisma.disputeEvidence.findFirst({ where: { finixFileId }, select: { churchId: true } }),
    prisma.supportTicketAttachment.findFirst({
      where: { finixFileId },
      select: { message: { select: { ticket: { select: { churchId: true } } } } },
    }),
  ]);

  if (compliance) return compliance.churchId;
  if (payout) return payout.organizationBankAccount.churchId;
  if (dispute?.churchId) return dispute.churchId;
  if (supportAttachment) return supportAttachment.message.ticket.churchId;
  return null;
}

/**
 * Global-admin-only OR merchant-own-church-only. This route proxies
 * Finix-hosted documents (compliance PDFs, bank-account docs, dispute
 * evidence, support attachments) — previously had NO authentication or
 * authorization at all, relying entirely on the Finix file ID being an
 * unguessable opaque string. Fixed to actually require a session and, for
 * a merchant session, verify real ownership via resolveFileOwnerChurchId()
 * — never trusting a client-supplied ID without checking which church (if
 * any) it actually belongs to. Admins keep platform-wide access, matching
 * their existing review role over onboarding/compliance/dispute material
 * elsewhere in this app. Fails closed: a file this can't attribute to any
 * known owner (or that belongs to a different church) is never served to
 * a merchant session, even if it exists in Finix.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing file ID" }, { status: 400 });
  }

  const adminSession = await getAdminSession();

  if (!adminSession) {
    let merchantChurchId: string | null = null;
    try {
      const merchantAuth = await requireMerchantSession();
      merchantChurchId = merchantAuth.churchId;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owningChurchId = await resolveFileOwnerChurchId(id);
    if (!owningChurchId || owningChurchId !== merchantChurchId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const file = await finixClient.getFileContent(id);
    return new NextResponse(file.data, {
      headers: {
        "Content-Type": file.contentType || "image/png",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error(`Failed to proxy file ${id} from Finix:`, err);
    return NextResponse.json({ error: "File not found or failed to fetch" }, { status: 404 });
  }
}
