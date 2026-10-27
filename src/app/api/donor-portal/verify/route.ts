import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyDonorLoginCode } from "@/lib/donorPortal/donorAuth";
import { checkSetupLinkRateLimit } from "@/lib/subscriptions/setupLinkRateLimit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = typeof body.slug === "string" ? body.slug : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkSetupLinkRateLimit(`donor-portal-verify:${ip}`)) {
    return NextResponse.json({ success: false, error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  }

  const church = slug ? await prisma.church.findUnique({ where: { slug }, select: { id: true, slug: true } }) : null;
  if (!church || !email || !code) {
    return NextResponse.json({ success: false, error: "That code is invalid or has expired. Request a new one." }, { status: 400 });
  }

  const result = await verifyDonorLoginCode(church.id, church.slug, email, code);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
