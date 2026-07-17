import { NextResponse } from "next/server";
import { headers } from "next/headers";

function mask(val: string | undefined): string {
  if (!val) return "❌ MISSING";
  if (val.length <= 8) return "✅ SET (too short to mask)";
  return `✅ ${val.slice(0, 4)}...${val.slice(-4)}`;
}

function maskConnectionString(val: string | undefined): string {
  if (!val) return "❌ MISSING";
  return val.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

export async function GET(req: Request) {
  // This endpoint reveals environment variable presence — protect it
  // with the same admin Basic Auth as the admin panel.
  const headerList = await headers();
  const authHeader = headerList.get("authorization") || "";
  const match = authHeader.match(/^Basic\s+(.*)$/i);
  let authed = false;
  if (match) {
    try {
      const decoded = Buffer.from(match[1], "base64").toString("utf8");
      const [u, p] = decoded.split(":");
      const validUser = process.env.ADMIN_USERNAME;
      const validPwd = process.env.ADMIN_PASSWORD;
      if (validUser && validPwd && u === validUser && p === validPwd) {
        authed = true;
      }
    } catch {
      // invalid base64 — fall through to 401
    }
  }
  if (!authed) {
    return new NextResponse("Auth Required", {
      status: 401,
      headers: { "WWW-Authenticate": "Basic realm=\"Secure Area\"" },
    });
  }

  return NextResponse.json({
    donorCoveredProfileConfigured: !!process.env.WGC_DONOR_COVERED_ZERO_FEE_PROFILE_ID,
    organizationPaidProfileConfigured: !!process.env.WGC_ORGANIZATION_PAID_FEE_PROFILE_ID,
    environment: process.env.NEXT_PUBLIC_FINIX_ENV || "unknown",
    databaseUrl: maskConnectionString(process.env.DATABASE_URL),
    directUrl: maskConnectionString(process.env.DIRECT_URL),
    finix: {
      env:            process.env.FINIX_ENV            || "❌ MISSING",
      baseUrl:        process.env.FINIX_BASE_URL        || "❌ MISSING",
      processor:      process.env.FINIX_PROCESSOR       || "❌ MISSING",
      applicationId:  mask(process.env.FINIX_APPLICATION_ID),
      username:       mask(process.env.FINIX_USERNAME),
      password:       mask(process.env.FINIX_PASSWORD),
      webhookSecret:  mask(process.env.FINIX_WEBHOOK_SECRET),
    },
    resend: {
      apiKey: mask(process.env.RESEND_API_KEY),
    },
    nextPublic: {
      finixEnv: process.env.NEXT_PUBLIC_FINIX_ENV || "❌ MISSING",
      appUrl:   process.env.NEXT_PUBLIC_APP_URL   || "❌ MISSING",
    },
    timestamp: new Date().toISOString(),
  });
}
