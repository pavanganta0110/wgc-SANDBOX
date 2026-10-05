import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { renderCampaignTemplate } from "@/lib/giving/campaignTemplate";

/**
 * Stateless preview — takes raw subject/body text directly (not a saved
 * campaign id), so the composer can call this on every keystroke/blur
 * while drafting, before anything is persisted. Renders with the org's
 * real name and a placeholder donor name/link, the same merge-field
 * function used for the actual send, so what's previewed is exactly what
 * gets sent.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const channel = body.channel === "TEXT" ? "TEXT" : "EMAIL";
  const subject = typeof body.emailSubject === "string" ? body.emailSubject : "";
  const rawTemplate = channel === "TEXT" ? body.textBodyTemplate : body.emailBodyTemplate;
  const template = typeof rawTemplate === "string" ? rawTemplate : "";

  const church = await prisma.church.findUnique({
    where: { id: auth.churchId },
    select: { name: true, logoUrl: true, primaryColor: true, statementSenderName: true },
  });

  const vars = {
    firstName: "Jordan",
    churchName: church?.name || "Your Organization",
    link: `${process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com"}/gc/preview-token`,
  };

  return NextResponse.json({
    subject: channel === "TEXT" ? null : renderCampaignTemplate(subject, vars),
    body: renderCampaignTemplate(template, vars),
    // Only meaningful for EMAIL — lets the composer's preview show the same
    // church branding (logo, brand color, and the merchant's own
    // configured signature — Settings -> Receipts & Annual Statements'
    // "Sender Name") that the actual send uses (see send-chunk/route.ts).
    // Never a hardcoded default here — whatever the merchant has (or
    // hasn't) set is exactly what shows, so the preview never overstates
    // what's actually configured.
    churchName: vars.churchName,
    logoUrl: channel === "TEXT" ? null : church?.logoUrl || null,
    senderName: channel === "TEXT" ? null : church?.statementSenderName || vars.churchName,
    badgeColor: channel === "TEXT" ? null : church?.primaryColor || null,
  });
}
