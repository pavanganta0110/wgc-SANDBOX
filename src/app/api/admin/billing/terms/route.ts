import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

const TERMS_TYPES = ["SUBSCRIPTION_TERMS", "CANCELLATION_POLICY", "BILLING_AUTHORIZATION", "PROMOTION_TERMS", "INVOICE_BILLING_TERMS"];

/**
 * Admin -> Billing & Subscriptions -> Terms. BillingTermsVersion rows are
 * append-only — WgcBillingAccount.authorizationTermsVersion permanently
 * references a specific version string, so POST always creates a NEW row
 * and never edits an existing one in place.
 */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const termsType = searchParams.get("type");
  if (!termsType || !TERMS_TYPES.includes(termsType)) {
    return NextResponse.json({ error: "A valid type query parameter is required." }, { status: 400 });
  }

  const history = await prisma.billingTermsVersion.findMany({
    where: { termsType },
    orderBy: { publishedAt: "desc" },
  });

  return NextResponse.json({ current: history[0] || null, history });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canManageBillingTerms) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { termsType, version, bodyMarkdown, confirmed, reason } = body;

  if (!termsType || !TERMS_TYPES.includes(termsType)) {
    return NextResponse.json({ error: "A valid termsType is required." }, { status: 400 });
  }
  if (!version || typeof version !== "string" || !version.trim()) {
    return NextResponse.json({ error: "A version string is required (e.g. \"v2\")." }, { status: 400 });
  }
  if (!bodyMarkdown || typeof bodyMarkdown !== "string" || !bodyMarkdown.trim()) {
    return NextResponse.json({ error: "Body text is required." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required to publish a new terms version." }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const existing = await prisma.billingTermsVersion.findUnique({ where: { termsType_version: { termsType, version } } });
  if (existing) {
    return NextResponse.json({ error: `Version "${version}" already exists for ${termsType}. Choose a different version string.` }, { status: 409 });
  }

  const created = await prisma.billingTermsVersion.create({
    data: { termsType, version, bodyMarkdown, publishedByUserId: session.userId },
  });

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "billing_terms.published",
    entityType: "BillingTermsVersion",
    entityId: created.id,
    newValue: { termsType, version },
    internalReason: reason,
  });

  return NextResponse.json({ success: true, version: created });
}
