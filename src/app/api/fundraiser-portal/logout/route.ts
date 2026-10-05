import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { FUNDRAISER_SESSION_COOKIE_NAME, clearFundraiserSessionCookie } from "@/lib/fundraiserPortal/fundraiserAuth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(FUNDRAISER_SESSION_COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.fundraiserPortalSession.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }
  await clearFundraiserSessionCookie();
  return NextResponse.json({ success: true });
}
