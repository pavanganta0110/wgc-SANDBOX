import { NextResponse } from "next/server";
import { isCrossSiteStateChange } from "@/lib/security/crossSiteGuard";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { auditEmbedSessionStart, buildEmbedSessionCookieFor, claimEmbedLink, getEmbedSignInMode } from "@/lib/partners/embedEntry";
import { findTeamMemberByEmail, verifyEmailCode } from "@/lib/partners/embedEmailCode";
import { isValidEmail } from "@/lib/donors/donorContact";

const WRONG_CODE = "That code is not right or has expired. Check the email, or ask for a new code.";

/** Checks the emailed code and, when right, signs the person in as themselves for the session (spending the page's one-time link). */
export async function POST(req: Request) {
  if (isCrossSiteStateChange("POST", req.headers.get("sec-fetch-site"))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
  const payload = verifyPartnerEmbedLinkToken(body.link);
  if (!payload) return NextResponse.json({ error: "This page has expired. Open WGC Payments again.", expired: true }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: WRONG_CODE }, { status: 401 });
  if ((await getEmbedSignInMode(payload.partnerId)) !== "EMAIL_CODE") return NextResponse.json({ error: WRONG_CODE }, { status: 401 });

  const user = await findTeamMemberByEmail(payload, email);
  if (!user || !(await verifyEmailCode(user.id, code))) return NextResponse.json({ error: WRONG_CODE }, { status: 401 });

  if ((await claimEmbedLink(payload)) === "used") return NextResponse.json({ error: "This page was already used. Open WGC Payments again.", expired: true }, { status: 409 });

  const res = NextResponse.json({ ok: true, next: "/merchant/dashboard" });
  res.headers.append("Set-Cookie", buildEmbedSessionCookieFor(user));
  res.headers.set("Cache-Control", "no-store");
  await auditEmbedSessionStart(user, payload.partnerId, "partner_embed_email_code", req);
  return res;
}
