import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";

/**
 * Waives an unpaid invoice of a partner (WGC super admin, with a reason). A paid invoice, an
 * already waived one, or one being charged right now can't be waived: the conditional update
 * only matches an invoice that is really unpaid, so a charge in flight is never raced.
 */
export async function POST(req: Request, { params }: { params: Promise<{ partnerId: string; invoiceId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId, invoiceId } = await params;

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (!reason) return NextResponse.json({ error: "Give a reason for waiving this invoice." }, { status: 400 });

  const result = await prisma.partnerInvoice.updateMany({
    where: { id: invoiceId, partnerId, status: { in: ["PENDING", "AWAITING_CARD", "FAILED"] } },
    data: { status: "WAIVED", nextAttemptAt: null, failureReason: `Waived: ${reason}` },
  });
  if (result.count !== 1) {
    return NextResponse.json({ error: "That invoice can't be waived. It may already be paid, waived, or being charged." }, { status: 409 });
  }
  await createAuditLog({ action: "PARTNER_INVOICE_WAIVED", actorEmail: auth.session.email, metadata: { partnerId, invoiceId, reason } });
  return NextResponse.json({ success: true });
}
