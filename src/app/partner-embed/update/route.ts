import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { onboardingStage } from "@/lib/partners/onboardingStages";

/**
 * "Add the missing information" from the partner's frame. Makes a fresh upload link for the
 * organization's application, but only while WGC is waiting on information, and only for an
 * application of the partner named in the signed embed link. Making a new link replaces the
 * old one (the same as WGC reissuing it), so it is done on click and not when the page loads.
 */
export async function GET(req: Request) {
  const link = new URL(req.url).searchParams.get("link") ?? "";
  const back = NextResponse.redirect(new URL(`/partner-embed?link=${encodeURIComponent(link)}`, req.url), 303);

  const payload = verifyPartnerEmbedLinkToken(link);
  if (!payload) return NextResponse.redirect(new URL("/partner-embed", req.url), 303);

  const app = await prisma.onboardingApplication.findFirst({
    where: { partnerId: payload.partnerId, partnerReference: payload.reference },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, onboardingStatus: true, submittedAt: true },
  });
  if (!app || onboardingStage(app) !== "information_required") return back;

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.onboardingApplication.update({
    where: { id: app.id },
    data: {
      updateTokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
      updateTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const res = NextResponse.redirect(new URL(`/onboarding/update/${rawToken}`, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
