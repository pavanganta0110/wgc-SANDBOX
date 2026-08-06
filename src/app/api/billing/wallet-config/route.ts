import { NextResponse } from "next/server";

/**
 * Application-wide Apple Pay / Google Pay gateway configuration for the
 * WGC platform-subscription activation form — the exact same values
 * loadPublicGivingPageData.ts and api/invoice/[token]/route.ts already
 * expose for donations/invoices, since wallet tokens are always scoped to
 * FINIX_APPLICATION_OWNER_ID (application-wide), never a specific
 * merchant. Not church-specific, so no auth/params needed here — safe to
 * expose, matching the existing "not secrets" reasoning in those routes.
 */
export async function GET() {
  const googlePayGatewayMerchantId = process.env.FINIX_APPLICATION_OWNER_ID || null;
  const googlePayMerchantId = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID || null;
  const googlePayEnvironment: "TEST" | "PRODUCTION" = process.env.NEXT_PUBLIC_FINIX_ENV === "live" ? "PRODUCTION" : "TEST";

  return NextResponse.json({ googlePayGatewayMerchantId, googlePayMerchantId, googlePayEnvironment });
}
