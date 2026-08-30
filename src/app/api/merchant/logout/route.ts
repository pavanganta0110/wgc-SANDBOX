import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { clearImpersonationCookie } from "@/lib/auth/impersonation";

export async function POST() {
  await clearSessionCookie();
  // Also clear any "View as Merchant" impersonation cookie — used by both
  // the merchant and admin logout buttons (they share this one route), so
  // a stale impersonation cookie can never survive a logout and later be
  // replayed if a different admin account logs in on the same browser.
  await clearImpersonationCookie();
  return NextResponse.json({ success: true });
}
