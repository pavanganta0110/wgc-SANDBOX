import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { sendExternalDonationReceiptEmail } from "@/lib/donations/sendExternalDonationReceiptEmail";
import { loadScopedExternalDonation } from "@/lib/donations/externalDonationScope";

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

  try {
    const result = await sendExternalDonationReceiptEmail(id, auth.churchId, auth.userId);
    if (!result.success) {
      return NextResponse.json({ error: "Failed to send receipt" }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to send receipt" }, { status: 400 });
  }
}
