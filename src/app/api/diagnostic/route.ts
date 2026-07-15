import { NextResponse } from "next/server";

function mask(val: string | undefined): string {
  if (!val) return "❌ MISSING";
  if (val.length <= 8) return "✅ SET (too short to mask)";
  return `✅ ${val.slice(0, 4)}...${val.slice(-4)}`;
}

export async function GET() {
  return NextResponse.json({
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
