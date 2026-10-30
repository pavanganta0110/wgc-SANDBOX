import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession, requirePartnerWriteSession } from "@/lib/partners/partnerSession";
import { sendPartnerTestEvent } from "@/lib/partners/partnerWebhooks";

/** Sends a signed `webhook.test` event to the partner's endpoint and reports what came back. */
export async function POST() {
  try {
    const session = await requirePartnerWriteSession();
    const result = await sendPartnerTestEvent(session.partnerId);
    return NextResponse.json(result);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
