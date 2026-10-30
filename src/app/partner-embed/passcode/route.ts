import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCrossSiteStateChange } from "@/lib/security/crossSiteGuard";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { EMBED_ROLES, auditEmbedSessionStart, buildEmbedSessionCookieFor, claimEmbedLink, getEmbedSignInMode } from "@/lib/partners/embedEntry";
import { checkFramePasscode, spendDecoyPasscodeCheck } from "@/lib/auth/framePasscode";
import { isValidEmail } from "@/lib/donors/donorContact";

const NOT_RIGHT = "That email or passcode is not right, or there were too many tries. Wait a few minutes and try again.";

/**
 * Signs a person in from inside a partner's frame with their email and their own passcode, for a partner whose
 * product has one shared login and cannot say who is opening WGC. The signed link names the partner and the
 * organization, so the person is looked up only inside that partner's own organization. Wrong emails, wrong
 * passcodes, people without a passcode and locked people all get the same answer. A link opens a dashboard once,
 * spent only when the sign-in works. People with two-factor sign-in are refused (this path has no code step),
 * and an owner works as the reduced embedded administrator.
 */
export async function POST(req: Request) {
  if (isCrossSiteStateChange("POST", req.headers.get("sec-fetch-site"))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  const payload = verifyPartnerEmbedLinkToken(body.link);
  if (!payload) return NextResponse.json({ error: "This page has expired. Open WGC Payments again.", expired: true }, { status: 400 });
  if (!isValidEmail(email) || passcode.length === 0 || passcode.length > 200) return NextResponse.json({ error: NOT_RIGHT }, { status: 401 });

  if ((await getEmbedSignInMode(payload.partnerId)) !== "PASSCODE") return NextResponse.json({ error: NOT_RIGHT }, { status: 401 });

  const church = await prisma.church.findFirst({ where: { partnerId: payload.partnerId, partnerReference: payload.reference }, select: { id: true } });
  const user = church
    ? await prisma.user.findFirst({
        where: { churchId: church.id, email, role: { in: EMBED_ROLES } },
        select: { id: true, email: true, role: true, churchId: true, authVersion: true, disabledAt: true, mfaEnabled: true },
      })
    : null;
  if (!user || !user.churchId || user.disabledAt || user.mfaEnabled) {
    await spendDecoyPasscodeCheck(passcode);
    return NextResponse.json({ error: NOT_RIGHT }, { status: 401 });
  }

  const check = await checkFramePasscode(user.id, passcode);
  if (!check.ok) return NextResponse.json({ error: NOT_RIGHT }, { status: 401 });

  if ((await claimEmbedLink(payload)) === "used") {
    return NextResponse.json({ error: "This page was already used. Open WGC Payments again.", expired: true }, { status: 409 });
  }

  const res = NextResponse.json({ ok: true, next: "/merchant/dashboard" });
  res.headers.append("Set-Cookie", buildEmbedSessionCookieFor({ ...user, churchId: user.churchId }));
  res.headers.set("Cache-Control", "no-store");
  await auditEmbedSessionStart({ ...user, churchId: user.churchId }, payload.partnerId, "partner_embed_passcode", req);
  return res;
}
