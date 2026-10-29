import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession } from "@/lib/partners/partnerSession";
import { loadPartnerBilling } from "@/lib/partners/partnerBillingSummary";

/** The signed-in partner's price, card on file (brand and last four only), next charge and past invoices. */
export async function GET() {
  try {
    const session = await requirePartnerSession();
    const billing = await loadPartnerBilling(session.partnerId);
    if (!billing) return NextResponse.json({ error: "Partner not found." }, { status: 404 });
    return NextResponse.json(billing);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
