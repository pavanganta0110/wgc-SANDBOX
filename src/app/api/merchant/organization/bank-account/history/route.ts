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
  const permissions = getOrganizationPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.organizationBankAccount.findMany({
    where: { churchId: auth.churchId },
    orderBy: { addedAt: "desc" },
  });

  const [deposits] = await Promise.all([
    // "COMPLETED" never actually appears in real data — Finix's real
    // funding-transfer state is "SUCCEEDED" (same mismatch already fixed
    // in bankAccountResolver.ts and elsewhere). arrivedAt is null on every
    // real row seen so far, so createdAtFinix is the only reliable
    // ordering/display timestamp.
    prisma.finixFundingTransferAttempt.findMany({
      where: { churchId: auth.churchId, state: { in: ["COMPLETED", "SUCCEEDED"] } },
      orderBy: { createdAtFinix: "desc" },
      select: { bankAccountLast4: true, arrivedAt: true, createdAtFinix: true },
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
      lastDepositAt: depositsForAccount[0]?.arrivedAt ?? depositsForAccount[0]?.createdAtFinix ?? null,
      createdByUserId: row.createdByUserId,
      changeReason: row.changeReason,
    };
  });

  return NextResponse.json({ history });
}
