import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveBankAccountDisplayStatus } from "@/lib/organization/bankAccountStatus";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getOrganizationPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await prisma.organizationBankAccount.findFirst({
    where: { churchId: auth.churchId, isActiveDestination: false, status: { notIn: ["REJECTED", "REPLACED"] } },
    orderBy: { addedAt: "desc" },
  });

  if (!pending) return NextResponse.json({ pendingChange: null });

  return NextResponse.json({
    pendingChange: {
      id: pending.id,
      last4: pending.last4,
      accountType: pending.accountType,
      displayStatus: resolveBankAccountDisplayStatus(pending),
      submittedAt: pending.addedAt,
      verifiedAt: pending.verifiedAt,
      failureMessageSafe: pending.failureMessageSafe,
      supportTicketId: pending.supportTicketId,
    },
  });
}
