import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { finixClient } from "@/lib/finix/client";
import { upsertComplianceFormFromFinix } from "@/lib/finix/sync/complianceForms";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requireFullOrganizationContext } from "@/lib/auth";
import { isAuthError } from "@/lib/auth/errors";

// Only the merchant's own admin may legally attest to their PCI SAQ — never
// wgc_admin, who can view but must not sign on a merchant's behalf.
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSettingsPermissions(auth.rawRole);
  if (!permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const isAccepted = body.isAccepted === true;

  if (!name || !title) {
    return NextResponse.json({ error: "Name and title are required" }, { status: 400 });
  }
  if (!isAccepted) {
    return NextResponse.json({ error: "You must accept the attestation to continue" }, { status: 400 });
  }

  const form = await prisma.complianceForm.findFirst({
    where: { churchId: auth.churchId },
    orderBy: { createdAt: "desc" },
  });
  if (!form) {
    return NextResponse.json({ error: "No compliance form found for this organization" }, { status: 404 });
  }
  if (form.state === "COMPLETE") {
    return NextResponse.json({ error: "This compliance form has already been signed" }, { status: 409 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ipAddress = (forwardedFor ? forwardedFor.split(",")[0].trim() : null) || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  const signedAt = new Date().toISOString();

  try {
    const updated = await finixClient.completeComplianceForm(form.finixComplianceFormId, {
      name,
      title,
      ip_address: ipAddress,
      user_agent: userAgent,
      signed_at: signedAt,
    });

    const saved = await upsertComplianceFormFromFinix(auth.churchId, form.finixMerchantId, updated);

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "COMPLIANCE_FORM_ATTESTED",
      entityType: "ComplianceForm",
      entityId: saved.id,
      metadata: { name, title, finixComplianceFormId: form.finixComplianceFormId },
      req,
    });

    return NextResponse.json({ form: saved });
  } catch (err: any) {
    console.error("Compliance form attestation failed:", err);
    return NextResponse.json({ error: "Failed to submit attestation. Please try again." }, { status: 502 });
  }
}
