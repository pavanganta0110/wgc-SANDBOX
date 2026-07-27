import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { sendExternalDonationReceiptEmail } from "@/lib/donations/sendExternalDonationReceiptEmail";

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
