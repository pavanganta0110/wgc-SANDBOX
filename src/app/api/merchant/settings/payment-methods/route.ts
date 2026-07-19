import { NextResponse } from "next/server";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { getPaymentMethodAvailability } from "@/lib/payments/paymentMethodAvailability";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSettingsPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const methods = await getPaymentMethodAvailability(auth.churchId);
  return NextResponse.json({ methods });
}
