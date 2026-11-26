import { NextResponse } from "next/server";
import { isCrossSiteStateChange } from "@/lib/security/crossSiteGuard";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { getEmbedSignInMode } from "@/lib/partners/embedEntry";
import { findTeamMemberByEmail, issueEmailCode } from "@/lib/partners/embedEmailCode";
import { isValidEmail } from "@/lib/donors/donorContact";
import { sendWgcEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { MFA_CODE_TTL_MINUTES } from "@/lib/auth/mfaCode";

const NOT_ON_TEAM = "That email is not set up for this organization. Ask your administrator to add you under Team, then try again.";

/**
 * Emails a one-time code to a person who typed their email in a partner's frame (embedSignInMode EMAIL_CODE).
 * The code is sent only to an address on the linked organization's team. An email that is not there gets an
 * error saying so, and nothing is sent.
 */
export async function POST(req: Request) {
  if (isCrossSiteStateChange("POST", req.headers.get("sec-fetch-site"))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const payload = verifyPartnerEmbedLinkToken(body.link);
  if (!payload) return NextResponse.json({ error: "This page has expired. Open WGC Payments again.", expired: true }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if ((await getEmbedSignInMode(payload.partnerId)) !== "EMAIL_CODE") return NextResponse.json({ error: NOT_ON_TEAM }, { status: 404 });

  const user = await findTeamMemberByEmail(payload, email);
  if (!user) return NextResponse.json({ error: NOT_ON_TEAM, code: "not_on_team" }, { status: 404 });

  const issued = await issueEmailCode(user);
  if (issued.status === "cooldown") return NextResponse.json({ error: `A code was just sent. Wait ${issued.retryAfterSeconds} seconds before asking for another.`, code: "cooldown" }, { status: 429 });
  if (issued.status === "limited") return NextResponse.json({ error: "Too many codes were requested. Try again later.", code: "limited" }, { status: 429 });

  // Say which product this is opening from, so the organization's people, who know it by the partner's name
  // and not WGC's, recognize the email. Falls back to the plain wording if the name can't be read.
  const partner = await prisma.partner.findUnique({ where: { id: payload.partnerId }, select: { name: true } }).catch(() => null);
  const partnerName = partner?.name?.trim() || null;
  const safeName = partnerName ? partnerName.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string) : null;

  const result = await sendWgcEmail({
    to: user.email,
    subject: partnerName ? `Your ${partnerName} sign-in code (WGC Payments)` : "Your WGC Payments code",
    title: "Your sign-in code",
    bodyHtml: `<p>Someone is opening WGC Payments${safeName ? ` from <strong>${safeName}</strong>` : ""} with your email. Your code is <strong style="font-size:24px;letter-spacing:4px">${issued.code}</strong></p>${
      safeName ? `<p>WGC Payments is the payments service inside ${safeName}.</p>` : ""
    }<p>It expires in ${MFA_CODE_TTL_MINUTES} minutes. If this was not you, ignore this email.</p>`,
  });
  if (!result.success) return NextResponse.json({ error: "We could not send the email. Try again in a moment.", code: "send_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
