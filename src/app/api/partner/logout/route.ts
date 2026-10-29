import { NextResponse } from "next/server";
import { clearPartnerSessionCookie } from "@/lib/partners/partnerSession";

export async function POST() {
  await clearPartnerSessionCookie();
  return NextResponse.json({ success: true });
}
