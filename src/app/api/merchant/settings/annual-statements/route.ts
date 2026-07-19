import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";

export async function GET() {
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — this route passes
  // session.role into a permission module that has its own wgc_admin branch
  // (for legitimate internal-support use via getSession() elsewhere); without
  // this guard, a wgc_admin session could be admitted here through that back
  // door. requireMerchantSession() (not yet adopted by this route) would
  // reject this unconditionally; this is the minimal-diff equivalent.
  if (session?.role === "wgc_admin") {
    return NextResponse.json({ error: "This route is not available to internal accounts." }, { status: 403 });
  }
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const church = await prisma.church.findUnique({
    where: { id: session.churchId },
    select: {
      logoUrl: true,
      taxId: true,
      website: true,
      statementSenderName: true,
      statementReplyToEmail: true,
      statementSubjectTemplate: true,
      statementThankYouMessage: true,
      statementDisclaimer: true,
      statementShowDonorCoveredFees: true,
      statementShowTaxId: true,
      statementShowWebsite: true,
      statementSignatureName: true,
      statementSignatureTitle: true,
      statementSignatureImageUrl: true,
      acknowledgmentNoGoodsServicesText: true,
      acknowledgmentGoodsServicesTemplate: true,
    },
  });

  return NextResponse.json({ settings: church });
}

function cleanString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

export async function PATCH(req: Request) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  // Statement configuration is an organization-level setting — same
  // authorization as editing a donor profile (church_admin for their own
  // org, wgc_admin for support).
  if (!session || !session.churchId || !permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const data = {
    logoUrl: cleanString(body.logoUrl, 2000),
    taxId: cleanString(body.taxId, 50),
    statementSenderName: cleanString(body.statementSenderName, 200),
    statementReplyToEmail: cleanString(body.statementReplyToEmail, 320),
    statementSubjectTemplate: cleanString(body.statementSubjectTemplate, 300),
    statementThankYouMessage: cleanString(body.statementThankYouMessage, 2000),
    statementDisclaimer: cleanString(body.statementDisclaimer, 2000),
    statementShowDonorCoveredFees: body.statementShowDonorCoveredFees === true,
    statementShowTaxId: body.statementShowTaxId === true,
    statementShowWebsite: body.statementShowWebsite === true,
    statementSignatureName: cleanString(body.statementSignatureName, 200),
    statementSignatureTitle: cleanString(body.statementSignatureTitle, 200),
    statementSignatureImageUrl: cleanString(body.statementSignatureImageUrl, 2000),
    acknowledgmentNoGoodsServicesText: cleanString(body.acknowledgmentNoGoodsServicesText, 1000),
    acknowledgmentGoodsServicesTemplate: cleanString(body.acknowledgmentGoodsServicesTemplate, 1000),
  };

  const church = await prisma.church.update({ where: { id: session.churchId }, data });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "statement_settings.updated",
    entityType: "church",
    entityId: session.churchId,
    req,
  });

  return NextResponse.json({ settings: church });
}
