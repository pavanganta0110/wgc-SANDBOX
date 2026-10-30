import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { EMBED_ROLES, auditEmbedSessionStart, buildEmbedSessionCookieFor, claimEmbedLink, getEmbedSignInMode } from "@/lib/partners/embedEntry";

/**
 * Where the partner's frame lands once the organization is approved, for a partner whose own
 * product says who is opening WGC (CRM_IDENTITY). The signed embed link names the partner and the
 * partner's own id for the organization; the organization and the person are then looked up here,
 * inside that partner's own organization, so a link can never open anyone else's dashboard. The
 * person is the one named in the link when they are on the organization's team, otherwise its owner.
 * People with MFA are refused (this path has no code step), and an owner is signed in with the
 * reduced embedded role (no bank, billing, API keys or webhooks). A partner whose product has one
 * shared login (PASSCODE) never comes through here: its people sign in with their own passcode.
 * Every refusal looks the same and sends the frame back to the page.
 */
export async function GET(req: Request) {
  const link = new URL(req.url).searchParams.get("link") ?? "";
  const back = (problem: boolean | "used") =>
    NextResponse.redirect(new URL(`/partner-embed?link=${encodeURIComponent(link)}${problem === "used" ? "&problem=used" : problem ? "&problem=1" : ""}`, req.url), 303);

  const payload = verifyPartnerEmbedLinkToken(link);
  if (!payload) return NextResponse.redirect(new URL("/partner-embed", req.url), 303);

  // The partner says who is opening WGC only when its own product knows. With one shared login it does not,
  // and a name it sent would be the same for everyone, so people sign in with their own passcode instead.
  if ((await getEmbedSignInMode(payload.partnerId)) !== "CRM_IDENTITY") return back(false);

  const church = await prisma.church.findFirst({
    where: { partnerId: payload.partnerId, partnerReference: payload.reference },
    select: { id: true },
  });
  if (!church) return back(false);

  const user = await prisma.user.findFirst({
    where: payload.email
      ? { churchId: church.id, email: payload.email, role: { in: EMBED_ROLES } }
      : { churchId: church.id, role: "owner" },
    select: { id: true, email: true, role: true, churchId: true, authVersion: true, disabledAt: true, mfaEnabled: true },
  });
  if (!user || !user.churchId || user.disabledAt || user.mfaEnabled) return back(true);

  if ((await claimEmbedLink(payload)) === "used") return back("used");

  const res = NextResponse.redirect(new URL("/merchant/dashboard", req.url), 303);
  res.headers.append("Set-Cookie", buildEmbedSessionCookieFor({ ...user, churchId: user.churchId }));
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  await auditEmbedSessionStart({ ...user, churchId: user.churchId }, payload.partnerId, "partner_embed_link", req);
  return res;
}
