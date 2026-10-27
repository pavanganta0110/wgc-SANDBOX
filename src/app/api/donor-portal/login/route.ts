import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueDonorLoginCode } from "@/lib/donorPortal/donorAuth";
import { checkSetupLinkRateLimit } from "@/lib/subscriptions/setupLinkRateLimit";
import { sendWgcEmail } from "@/lib/email";

const GENERIC_RESPONSE = { message: "If we found giving under that email, we've sent a sign-in code. Check your inbox." };

/** Always returns the same generic message regardless of match or throttling, so this can't be used to learn who has given to an organization. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = typeof body.slug === "string" ? body.slug : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!slug || !email) return NextResponse.json(GENERIC_RESPONSE);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkSetupLinkRateLimit(`donor-portal-login:${ip}`)) return NextResponse.json(GENERIC_RESPONSE);

  // Church comes from the slug server-side; a client-supplied churchId is never accepted.
  const church = await prisma.church.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!church) return NextResponse.json(GENERIC_RESPONSE);

  const issued = await issueDonorLoginCode(church.id, email);
  if (!issued.issued || !issued.donor.email) return NextResponse.json(GENERIC_RESPONSE);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  const linkUrl = `${appUrl}/give/${church.slug}/account/verify/${issued.linkToken}`;

  await sendWgcEmail({
    to: issued.donor.email,
    subject: `Your ${church.name} sign-in code: ${issued.code}`,
    title: "Sign In to Your Giving",
    badgeText: "Sign-In Code",
    badgeColor: "#4F46E5",
    bodyHtml: `
      <p>Use this code to view your giving to <strong>${church.name}</strong>:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0;">${issued.code}</p>
      <p>Or sign in with one tap:</p>
      <p><a href="${linkUrl}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;">Sign In</a></p>
      <p style="font-size:12px;color:#64748b;">This code and link expire in 15 minutes and can only be used once. If you didn't ask for this, you can ignore this email.</p>
    `,
    // No `log`: sign-in codes are credentials and must not appear in the church-visible email log.
  });

  return NextResponse.json(GENERIC_RESPONSE);
}
