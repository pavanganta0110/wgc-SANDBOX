import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic endpoint — added to investigate a live report of
 * Google Pay showing "Add credit or debit card" for an authenticated
 * donor with a verified card already in their Wallet, after the normal
 * client-side wallet debug logging (which is a no-op in production) gave
 * zero visibility into the actual loadPaymentData failure. Remove once
 * root cause is confirmed and fixed.
 *
 * Accepts ONLY the safe diagnostic fields below — never card data, CVC,
 * expiration, billing address, wallet/payment tokens, or donor PII.
 * Logs server-side (retrievable via Vercel function logs) so we don't
 * need a donor to screen-record their own browser console.
 */

interface GooglePayDiagnosticReport {
  statusCode?: string;
  statusMessage?: string;
  environment?: string;
  merchantIdConfigured?: boolean;
  gatewayMerchantIdConfigured?: boolean;
  browserType?: string;
  requestTimestamp?: string;
}

function isSafeString(v: unknown, maxLen = 200): v is string {
  return typeof v === "string" && v.length <= maxLen;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const report: GooglePayDiagnosticReport = {
    statusCode: isSafeString(raw.statusCode) ? raw.statusCode : undefined,
    statusMessage: isSafeString(raw.statusMessage, 500) ? raw.statusMessage : undefined,
    environment: isSafeString(raw.environment, 20) ? raw.environment : undefined,
    merchantIdConfigured: typeof raw.merchantIdConfigured === "boolean" ? raw.merchantIdConfigured : undefined,
    gatewayMerchantIdConfigured: typeof raw.gatewayMerchantIdConfigured === "boolean" ? raw.gatewayMerchantIdConfigured : undefined,
    browserType: isSafeString(raw.browserType, 100) ? raw.browserType : undefined,
    requestTimestamp: isSafeString(raw.requestTimestamp, 40) ? raw.requestTimestamp : undefined,
  };

  // eslint-disable-next-line no-console
  console.error("[GooglePayDiagnostic:TEMPORARY]", JSON.stringify(report));

  return NextResponse.json({ received: true });
}
