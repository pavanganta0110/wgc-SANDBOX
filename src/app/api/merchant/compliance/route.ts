import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconcileComplianceFormsForChurch, resolveComplianceStatus } from "@/lib/finix/sync/complianceForms";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  // Team-access Checkpoint 4D: compliance reads are OWNER/authorized ADMIN
  // only (canManageOrgSettings) — FUNDRAISER/VIEWER denied.
  const normalized = normalizeMerchantRole(auth.rawRole);
  if (!normalized || !(normalized === "owner" || ROLE_PERMISSIONS[normalized].canManageOrgSettings)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await reconcileComplianceFormsForChurch(auth.churchId);

  const form = await prisma.complianceForm.findFirst({
    where: { churchId: auth.churchId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    form,
    status: resolveComplianceStatus(form ? { state: form.state, dueAt: form.dueAt } : null),
  });
}
