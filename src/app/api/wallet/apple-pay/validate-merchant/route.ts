import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { finixClient } from "@/lib/finix/client";

/**
 * Exchanges the validationURL from Apple Pay's onvalidatemerchant callback
 * for a signed Apple merchant session, per
 * docs.finix.com/guides/online-payments/digital-wallets/apple-pay/apple-pay-on-web.
 *
 * All Finix credentials stay server-side (FinixClient reads FINIX_USERNAME/
 * FINIX_PASSWORD from the environment) — the browser only ever sees the
 * final merchant session object, never touches Finix's API directly.
 *
 * The domain is derived from the request's own Host header rather than
 * trusted from the request body — Apple Pay's validationURL is already
 * scoped to the real origin the browser is on, and deriving domain
 * server-side means a caller can't spoof a different domain into the
 * validation call.
 */
export async function POST(req: Request) {
  const applicationOwnerId = process.env.FINIX_APPLICATION_OWNER_ID;
  if (!applicationOwnerId) {
    return NextResponse.json({ error: "Apple Pay is not configured" }, { status: 503 });
  }

  const { validationURL } = await req.json();
  if (!validationURL || typeof validationURL !== "string") {
    return NextResponse.json({ error: "Missing validationURL" }, { status: 400 });
  }

  const headerList = await headers();
  const domain = headerList.get("host");
  if (!domain) {
    return NextResponse.json({ error: "Could not resolve request domain" }, { status: 400 });
  }

  try {
    const session = await finixClient.createApplePaySession({
      display_name: "WGC Payments",
      domain,
      merchant_identity: applicationOwnerId,
      validation_url: validationURL,
    });

    // Finix wraps Apple's merchant session as a *stringified* JSON blob —
    // ApplePaySession.completeMerchantValidation() needs the parsed object.
    const sessionDetails = session?.session_details;
    if (!sessionDetails) {
      throw new Error("Finix did not return session_details");
    }
    const merchantSession = typeof sessionDetails === "string" ? JSON.parse(sessionDetails) : sessionDetails;

    return NextResponse.json({ merchantSession });
  } catch (error: any) {
    console.error("Apple Pay merchant validation failed:", error);
    return NextResponse.json({ error: "Could not start Apple Pay session" }, { status: 502 });
  }
}
