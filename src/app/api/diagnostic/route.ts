import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    donorCoveredProfileConfigured: !!process.env.WGC_DONOR_COVERED_ZERO_FEE_PROFILE_ID,
    organizationPaidProfileConfigured: !!process.env.WGC_ORGANIZATION_PAID_FEE_PROFILE_ID,
    environment: process.env.NEXT_PUBLIC_FINIX_ENV || "unknown"
  });
}
