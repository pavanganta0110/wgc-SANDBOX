import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { clearImpersonationCookie } from "@/lib/auth/impersonation";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";

export async function POST() {
  await clearSessionCookie();
  // Also clear any "View as Merchant" impersonation cookie — used by both
  // the merchant and admin logout buttons (they share this one route), so
  // a stale impersonation cookie can never survive a logout and later be
  // replayed if a different admin account logs in on the same browser.
  await clearImpersonationCookie();
  const res = NextResponse.json({ success: true });
  // A session opened inside a partner's frame is a Partitioned, SameSite=None cookie. A browser only removes
  // such a cookie when the clearing header names it the same way, so also send that form. Without it the person
  // stayed signed in inside the frame after "Log out". Harmless for an ordinary session.
  res.headers.append("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`);
  return res;
}
