import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { getPaymentMethodAvailability } from "@/lib/payments/paymentMethodAvailability";

export async function GET() {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const methods = await getPaymentMethodAvailability(session.churchId);
  return NextResponse.json({ methods });
}
