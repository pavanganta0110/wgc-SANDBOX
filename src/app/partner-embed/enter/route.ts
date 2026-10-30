import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEmbedSessionCookie } from "@/lib/auth/embedLogin";
import { createSessionToken } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { logDashboardAction } from "@/lib/dashboardAudit";

const EMBED_ROLES = ["owner", "admin", "fundraiser", "viewer"];

/**
 * Where the partner's frame lands once the organization is approved. The signed embed link
 * names the partner and the partner's own id for the organization; the organization and the
 * person are then looked up here, inside that partner's own organization, so a link can never
 * open anyone else's dashboard. The person is the CRM user named in the link when they are on
 * the organization's team, otherwise its owner. People with MFA are refused (this path has no
 * code step), and an owner is signed in with the reduced embedded role (no bank, team,
 * billing, API keys or webhooks). Every refusal looks the same and sends the frame back to the page.
 */
export async function GET(req: Request) {
  const link = new URL(req.url).searchParams.get("link") ?? "";
  const back = (problem: boolean) => NextResponse.redirect(new URL(`/partner-embed?link=${encodeURIComponent(link)}${problem ? "&problem=1" : ""}`, req.url), 303);

  const payload = verifyPartnerEmbedLinkToken(link);
  if (!payload) return NextResponse.redirect(new URL("/partner-embed", req.url), 303);

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

  const sessionToken = createSessionToken({
    userId: user.id,
    email: user.email,
    role: (user.role === "owner" ? "admin" : user.role) as "admin" | "fundraiser" | "viewer",
    churchId: user.churchId,
    authVersion: user.authVersion,
    embedded: true,
  });

  const res = NextResponse.redirect(new URL("/merchant/dashboard", req.url), 303);
  res.headers.append("Set-Cookie", buildEmbedSessionCookie(SESSION_COOKIE_NAME, sessionToken));
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");

  try {
    await logDashboardAction({
      churchId: user.churchId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "auth.embed_session_started",
      entityType: "user",
      entityId: user.id,
      metadata: { partnerId: payload.partnerId, via: "partner_embed_link" },
      req,
    });
  } catch (err) {
    console.error("Failed to audit partner embed session start:", err);
  }
  return res;
}
