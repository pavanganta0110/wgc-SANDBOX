import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveBankAccountDisplayStatus } from "@/lib/organization/bankAccountStatus";

export async function GET() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await prisma.organizationBankAccount.findFirst({
    where: { churchId: session.churchId, isActiveDestination: false, status: { notIn: ["REJECTED", "REPLACED"] } },
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
      supportTicketId: pending.supportTicketId,
    },
  });
}
