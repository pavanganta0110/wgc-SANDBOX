import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { sendExternalDonationReceiptEmail, renderExternalDonationReceiptPdf } from "@/lib/donations/sendExternalDonationReceiptEmail";
import { parseAdditionalRecipients } from "@/lib/email";
import { loadScopedExternalDonation } from "@/lib/donations/externalDonationScope";

/** Downloads the receipt PDF — never sends an email, never mutates
 * receipt-sent state. Same permission as sending, since both surface the
 * same donor-facing financial document. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canSendExternalDonationReceipt");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { id } = await params;
  const donation = await loadScopedExternalDonation(id, auth);
  if (!donation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { pdf, fileName } = await renderExternalDonationReceiptPdf(id, auth.churchId);
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${new URL(req.url).searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${fileName}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate receipt";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canSendExternalDonationReceipt");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { id } = await params;
  const donation = await loadScopedExternalDonation(id, auth);
  if (!donation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let additionalRecipients: string[] = [];
  try {
    const body = await req.json();
    additionalRecipients = parseAdditionalRecipients(body?.additionalRecipients);
  } catch {
    // No JSON body — donor only, as before.
  }

  try {
    const result = await sendExternalDonationReceiptEmail(id, auth.churchId, auth.userId, additionalRecipients);
    if (!result.success) {
      return NextResponse.json({ error: "Failed to send receipt" }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to send receipt" }, { status: 400 });
  }
}
