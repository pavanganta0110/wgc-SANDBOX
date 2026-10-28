import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDonorSession, DonorAuthError, findPortalDonorsByEmail } from "@/lib/donorPortal/donorAuth";
import { renderDonationReceiptPdfForPayment } from "@/lib/giving/generateReceipt";
import { renderExternalDonationReceiptPdf } from "@/lib/donations/sendExternalDonationReceiptEmail";

const NOT_FOUND = () => NextResponse.json({ error: "Receipt not found." }, { status: 404 });

/**
 * Receipt PDF for one of the signed-in donor's own gifts. The gift must belong
 * to this church AND to a donor record sharing the signed-in donor's email;
 * anything else is a plain 404, so ids can't be probed. Nothing is issued or
 * sent by downloading.
 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const slug = new URL(req.url).searchParams.get("slug") ?? "";

  let session;
  try {
    session = await requireDonorSession(slug);
  } catch (err) {
    if (err instanceof DonorAuthError) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    throw err;
  }
  if (kind !== "payment" && kind !== "external") return NOT_FOUND();

  const sessionDonor = await prisma.donor.findFirst({ where: { id: session.donorId, churchId: session.churchId }, select: { email: true } });
  const donorIds = sessionDonor?.email ? (await findPortalDonorsByEmail(session.churchId, sessionDonor.email)).map((d) => d.id) : [];
  if (donorIds.length === 0) return NOT_FOUND();

  try {
    if (kind === "payment") {
      // A gift belongs to the donor directly, or through the card/bank it was paid with (how the portal lists gifts).
      const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { churchId: session.churchId, donorId: { in: donorIds } }, select: { finixPaymentInstrumentId: true } });
      const payment = await prisma.payment.findFirst({
        where: {
          id,
          churchId: session.churchId,
          status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] },
          OR: [{ donorId: { in: donorIds } }, { finixPaymentInstrumentId: { in: instruments.map((i) => i.finixPaymentInstrumentId) } }],
        },
        select: { id: true },
      });
      if (!payment) return NOT_FOUND();
      const { pdf, fileName } = await renderDonationReceiptPdfForPayment(payment.id, session.churchId);
      return pdfResponse(pdf, fileName);
    }

    const donation = await prisma.externalDonation.findFirst({
      where: { id, churchId: session.churchId, donorId: { in: donorIds }, status: { not: "VOIDED" }, isAnonymous: false },
      select: { id: true, depositStatus: true },
    });
    if (!donation || donation.depositStatus === "RETURNED") return NOT_FOUND();
    const { pdf, fileName } = await renderExternalDonationReceiptPdf(donation.id, session.churchId);
    return pdfResponse(pdf, fileName);
  } catch (err) {
    console.error("Donor portal receipt failed:", err);
    return NextResponse.json({ error: "We couldn't prepare that receipt. Please try again." }, { status: 500 });
  }
}

function pdfResponse(pdf: Buffer, fileName: string) {
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "private, no-store" },
  });
}
