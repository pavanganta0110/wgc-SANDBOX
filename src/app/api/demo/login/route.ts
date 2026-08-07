import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth/session";

export async function GET(request: Request) {
  // Find a sandbox merchant user to log in as.
  // We'll pick the first user who is an "owner" of an organization.
  const user = await prisma.user.findFirst({
    where: { 
      email: "admin@gracecommunity.org",
      role: "owner",
      churchId: { not: null },
      disabledAt: null 
    }
  });

  if (!user) {
    return NextResponse.json({ error: "No sandbox merchant found in the database." }, { status: 404 });
  }

  // Set the session cookie for this user
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role as "owner",
    churchId: user.churchId,
    authVersion: user.authVersion,
  });

  // Redirect to the real merchant dashboard
  const response = NextResponse.redirect(new URL("/merchant/dashboard", request.url));
  response.cookies.set("wgc_demo_mode", "true", { path: "/" });
  return response;
}
