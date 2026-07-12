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

  const rows = await prisma.organizationBankAccount.findMany({
    where: { churchId: session.churchId },
    orderBy: { addedAt: "desc" },
  });

  const [deposits] = await Promise.all([
    prisma.finixFundingTransferAttempt.findMany({
      where: { churchId: session.churchId, state: "COMPLETED" },
      orderBy: { arrivedAt: "desc" },
      select: { bankAccountLast4: true, arrivedAt: true },
    }),
  ]);

  const history = rows.map((row) => {
    const depositsForAccount = row.last4 ? deposits.filter((d) => d.bankAccountLast4 === row.last4) : [];
    return {
      id: row.id,
      bankName: row.bankName,
      accountHolderName: row.accountHolderName,
      last4: row.last4,
      accountType: row.accountType,
      displayStatus: resolveBankAccountDisplayStatus(row),
      addedAt: row.addedAt,
      activatedAt: row.activatedAt,
      replacedAt: row.replacedAt,
      depositsReceived: depositsForAccount.length,
      lastDepositAt: depositsForAccount[0]?.arrivedAt ?? null,
      createdByUserId: row.createdByUserId,
      changeReason: row.changeReason,
    };
  });

  return NextResponse.json({ history });
}
